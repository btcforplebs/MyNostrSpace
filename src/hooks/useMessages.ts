/**
 * useMessages Hook
 * Subscribes to legacy DM messages (kind 4 - NIP-04)
 * Note: NIP-17 gift-wrapped (kind 1059) support commented out pending NIP-44 ecosystem support
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type NDK from '@nostr-dev-kit/ndk';
import { NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { addMessage, type CachedDMMessage, getAllMessages, db } from '../services/messageCache';

interface UseMessagesReturn {
  messages: CachedDMMessage[];
  loading: boolean;
  error: string | null;
}

const BATCH_DELAY = 300; // milliseconds

/**
 * Hook to subscribe to gift-wrapped DM messages
 * Uses the NDK signer for decryption to support NIP-07 and NIP-46 signers
 * @param userPubkey The logged-in user's pubkey
 * @param ndk NDK instance
 * @returns Object with messages array, loading state, and errors
 */
export function useMessages(
  userPubkey: string | null,
  ndk: NDK | null
): UseMessagesReturn {
  const [messages, setMessages] = useState<CachedDMMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const messageBuffer = useRef<CachedDMMessage[]>([]);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const processedEventIds = useRef<Set<string>>(new Set());

  const flushMessageBuffer = useCallback(() => {
    if (messageBuffer.current.length > 0) {
      setMessages((prev) => {
        const combined = [...prev, ...messageBuffer.current];
        // Deduplicate by ID and sort by timestamp
        const deduped = Array.from(
          new Map(combined.map((msg) => [msg.id, msg])).values()
        ).sort((a, b) => a.originalTimestamp - b.originalTimestamp);
        return deduped;
      });
      messageBuffer.current = [];
    }
    flushTimeoutRef.current = null;
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }
    flushTimeoutRef.current = setTimeout(flushMessageBuffer, BATCH_DELAY);
  }, [flushMessageBuffer]);

  // Load cached messages on mount
  useEffect(() => {
    (async () => {
      try {
        const cachedMessages = await getAllMessages();
        setMessages(cachedMessages);
        console.log(`📦 Loaded ${cachedMessages.length} cached messages from database`);
      } catch (err) {
        console.error('Failed to load cached messages:', err);
      }
    })();
  }, []);

  const handleLegacyDmEvent = useCallback(
    (event: NDKEvent) => {
      // Skip if already processed
      if (processedEventIds.current.has(event.id)) {
        return;
      }
      processedEventIds.current.add(event.id);

      (async () => {
        try {
          // Check if message already exists in cache to avoid re-decryption
          const existingMessage = await db.messages.get(event.id);

          if (existingMessage) {
            // Message exists in cache, just add to state if not there
            const cachedMessage: CachedDMMessage = {
              ...existingMessage,
              // Ensure these computed fields are correct even if DB data is older schema
              isOutgoing: event.pubkey === userPubkey,
            };

            messageBuffer.current.push(cachedMessage);
            scheduleFlush();
            return;
          }

          if (!ndk?.signer) {
            console.warn('No signer available for DM decryption');
            return;
          }

          // For legacy DMs (kind 4), decrypt using NIP-04
          let content: string;
          try {
            content = await (ndk.signer as any).decrypt?.(
              { pubkey: event.pubkey } as any,
              event.content
            );
          } catch (decryptErr) {
            console.error('❌ DM decryption failed:', decryptErr);
            return;
          }

          if (!content) {
            console.warn('Failed to decrypt DM:', event.id);
            return;
          }

          // Read status for NEW messages is always false (unless we sent it)
          const isOutgoing = event.pubkey === userPubkey;

          const cachedMessage: CachedDMMessage = {
            id: event.id,
            conversationWith: event.pubkey,
            content,
            senderPubkey: event.pubkey,
            originalTimestamp: event.created_at || Math.floor(Date.now() / 1000),
            receivedAt: Math.floor(Date.now() / 1000),
            isOutgoing,
            read: isOutgoing, // Outgoing messages are implicitly read
          };

          // Add to buffer for batching
          messageBuffer.current.push(cachedMessage);

          // Store in Dexie
          addMessage(cachedMessage).catch((err) => {
            console.error('Failed to cache DM:', err);
          });

          scheduleFlush();
        } catch (err) {
          console.error('Error handling DM event:', err);
        }
      })();
    },
    [ndk, userPubkey, scheduleFlush]
  );

  useEffect(() => {
    if (!userPubkey || !ndk || !ndk.signer) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('🔍 Starting message subscription for pubkey:', userPubkey);

      // Subscribe to kind 4 (legacy DMs with NIP-04 encryption)
      // Works with all current Nostr signers/extensions
      const filter = {
        kinds: [4], // kind 4 = legacy DM (NIP-04)
        '#p': [userPubkey],
        limit: 100,
      };

      console.log('📡 Subscription filter:', filter);
      console.log('🔗 Connected relays:', ndk.pool.relays.keys());

      const sub = ndk.subscribe(filter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
      });

      sub.on('event', (event: NDKEvent) => {
        console.log('📨 Received DM event:', event.id);
        handleLegacyDmEvent(event);
      });

      sub.on('eose', () => {
        console.log('✅ End of stored events (eose) - finished loading cache');
        // Flush any remaining messages when we finish loading from cache
        if (flushTimeoutRef.current) {
          clearTimeout(flushTimeoutRef.current);
        }
        flushMessageBuffer();
        setLoading(false);
      });

      unsubscribeRef.current = () => sub.stop();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to subscribe to messages';
      setError(errorMsg);
      setLoading(false);
      console.error('useMessages error:', err);
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
    };
  }, [userPubkey, ndk, handleLegacyDmEvent, flushMessageBuffer]);

  return { messages, loading, error };
}

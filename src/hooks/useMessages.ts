/**
 * useMessages Hook
 * Subscribes to legacy DM messages (kind 4 - NIP-04)
 * Note: NIP-17 gift-wrapped (kind 1059) support commented out pending NIP-44 ecosystem support
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type NDK from '@nostr-dev-kit/ndk';
import { NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import type { NDKEvent, NDKUser, NDKSigner } from '@nostr-dev-kit/ndk';
import { addMessage, type CachedDMMessage, getAllMessages, db } from '../services/messageCache';

interface UseMessagesReturn {
  messages: CachedDMMessage[];
  loading: boolean;
  error: string | null;
  appendMessage: (message: CachedDMMessage) => void;
}

const BATCH_DELAY = 300; // milliseconds

/**
 * Hook to subscribe to gift-wrapped DM messages
 * Uses the NDK signer for decryption to support NIP-07 and NIP-46 signers
 * @param userPubkey The logged-in user's pubkey
 * @param ndk NDK instance
 * @returns Object with messages array, loading state, and errors
 */
export function useMessages(userPubkey: string | null, ndk: NDK | null): UseMessagesReturn {
  const [messages, setMessages] = useState<CachedDMMessage[]>([]);
  const [loading, setLoading] = useState(() => !!(userPubkey && ndk && ndk.signer));
  const [error, setError] = useState<string | null>(null);
  const [prevUserPubkey, setPrevUserPubkey] = useState(userPubkey);

  // Reset state during render if pubkey changes (React recommended pattern).
  // Clearing messages here prevents one account's cached DMs from flashing under
  // another account after a switch.
  if (userPubkey !== prevUserPubkey) {
    setPrevUserPubkey(userPubkey);
    setLoading(!!(userPubkey && ndk && ndk.signer));
    setError(null);
    setMessages([]);
  }

  const messageBuffer = useRef<CachedDMMessage[]>([]);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const processedEventIds = useRef<Set<string>>(new Set());

  const flushMessageBuffer = useCallback(() => {
    if (messageBuffer.current.length > 0) {
      // Snapshot and clear the buffer BEFORE dispatch. React can run the updater
      // synchronously at render time (behind another pending update), by which
      // point messageBuffer.current would already be reset — dropping the batch.
      const batch = messageBuffer.current;
      messageBuffer.current = [];
      setMessages((prev) => {
        const combined = [...prev, ...batch];
        // Deduplicate by ID and sort by timestamp
        const deduped = Array.from(new Map(combined.map((msg) => [msg.id, msg])).values()).sort(
          (a, b) => a.originalTimestamp - b.originalTimestamp
        );
        return deduped;
      });
    }
    flushTimeoutRef.current = null;
  }, []);

  // Add a locally-produced message (e.g. one the user just sent) straight into
  // state so it appears immediately, and mark it processed so the relay echo of
  // the same event id is not handled twice.
  const appendMessage = useCallback((message: CachedDMMessage) => {
    processedEventIds.current.add(message.id);
    setMessages((prev) => {
      const combined = [...prev, message];
      return Array.from(new Map(combined.map((m) => [m.id, m])).values()).sort(
        (a, b) => a.originalTimestamp - b.originalTimestamp
      );
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }
    flushTimeoutRef.current = setTimeout(flushMessageBuffer, BATCH_DELAY);
  }, [flushMessageBuffer]);

  // Load this account's cached messages when the logged-in pubkey changes.
  useEffect(() => {
    // New account context: drop any in-flight dedupe/buffer state.
    processedEventIds.current = new Set();
    messageBuffer.current = [];

    if (!userPubkey) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const cachedMessages = await getAllMessages(userPubkey);
        if (!cancelled) {
          setMessages(cachedMessages);
          console.log(`📦 Loaded ${cachedMessages.length} cached messages from database`);
        }
      } catch (err) {
        console.error('Failed to load cached messages:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userPubkey]);

  const handleLegacyDmEvent = useCallback(
    (event: NDKEvent) => {
      if (!userPubkey) return;

      // Skip if already processed
      if (processedEventIds.current.has(event.id)) {
        return;
      }
      processedEventIds.current.add(event.id);

      // The conversation partner is the sender for incoming messages, or the
      // 'p'-tagged recipient for messages we authored ourselves.
      const isOutgoing = event.pubkey === userPubkey;
      const recipient = event.tags.find((t) => t[0] === 'p')?.[1];
      const otherParty = isOutgoing ? recipient : event.pubkey;

      // Un-attributable event (e.g. our own event missing its p-tag): let a
      // future redelivery retry rather than silently dropping it forever.
      if (!otherParty) {
        processedEventIds.current.delete(event.id);
        return;
      }

      (async () => {
        try {
          // Check if message already exists in cache to avoid re-decryption
          const existingMessage = await db.messages.get(event.id);

          if (existingMessage) {
            // Message exists in cache, just add to state if not there
            const cachedMessage: CachedDMMessage = {
              ...existingMessage,
              // Ensure these computed fields are correct even if DB data is older schema
              owner: userPubkey,
              isOutgoing,
            };

            messageBuffer.current.push(cachedMessage);
            scheduleFlush();
            return;
          }

          if (!ndk?.signer) {
            console.warn('No signer available for DM decryption');
            // Allow retry once a signer is available.
            processedEventIds.current.delete(event.id);
            return;
          }

          // For legacy DMs (kind 4), decrypt using NIP-04 against the OTHER
          // party (sender for incoming, recipient for our own sent messages).
          let content: string;
          try {
            content = await (ndk.signer as NDKSigner).decrypt!(
              { pubkey: otherParty } as NDKUser,
              event.content
            );
          } catch (decryptErr) {
            console.error('❌ DM decryption failed:', decryptErr);
            // Transient signer failures shouldn't drop the message permanently.
            processedEventIds.current.delete(event.id);
            return;
          }

          if (!content) {
            console.warn('Failed to decrypt DM:', event.id);
            processedEventIds.current.delete(event.id);
            return;
          }

          const cachedMessage: CachedDMMessage = {
            id: event.id,
            owner: userPubkey,
            conversationWith: otherParty,
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
      return;
    }

    try {
      console.log('🔍 Starting message subscription for pubkey:', userPubkey);

      // Subscribe to kind 4 (legacy DMs with NIP-04 encryption).
      // Two filters: messages sent TO us (#p) and messages WE sent (authors),
      // so a fresh device / cleared cache reconstructs both sides of every
      // conversation, not just the incoming half.
      const filters = [
        { kinds: [4], '#p': [userPubkey], limit: 100 },
        { kinds: [4], authors: [userPubkey], limit: 100 },
      ];

      console.log('📡 Subscription filters:', filters);
      console.log('🔗 Connected relays:', ndk.pool.relays.keys());

      const sub = ndk.subscribe(filters, {
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
      // Use microtask to avoid synchronous setState in effect body
      Promise.resolve().then(() => {
        setError(errorMsg);
        setLoading(false);
      });
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

  return { messages, loading, error, appendMessage };
}

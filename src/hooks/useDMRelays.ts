/**
 * useDMRelays Hook
 * Fetches and caches a user's DM relay preferences (kind 10050)
 */

import { useEffect, useState, useCallback } from 'react';
import type NDK from '@nostr-dev-kit/ndk';

interface DMRelayCache {
  pubkey: string;
  relays: string[];
  timestamp: number;
}

// Cache with 24-hour TTL
const dmRelayCache = new Map<string, DMRelayCache>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch DM relays for a user from kind 10050 event
 */
async function fetchDMRelaysFromNdk(pubkey: string, ndk: NDK): Promise<string[]> {
  try {
    const user = ndk.getUser({ pubkey });
    const event = await user.fetchProfile();

    if (!event) {
      return [];
    }

    // Kind 10050 is a relay list event
    // Try to fetch it directly
    const filter = {
      kinds: [10050],
      authors: [pubkey],
      limit: 1,
    };

    const events = await ndk.fetchEvents(filter);
    if (events.size === 0) {
      return [];
    }

    const relayEvent = Array.from(events)[0];
    if (!relayEvent.content) {
      return [];
    }

    try {
      const relayMap = JSON.parse(relayEvent.content);
      // Kind 10050 contains relays in format { "url": { read: boolean, write: boolean } }
      return Object.keys(relayMap).filter((url) => {
        const relay = relayMap[url];
        // Return relay if it has read enabled (we need it for receiving DMs)
        return relay && (relay.read === true || relay.read === undefined);
      });
    } catch {
      // If parsing fails, return empty array
      return [];
    }
  } catch (err) {
    console.warn(`Failed to fetch DM relays for ${pubkey}:`, err);
    return [];
  }
}

/**
 * Hook to fetch and cache DM relay preferences
 * @param pubkey The user's pubkey to fetch relays for
 * @param ndk NDK instance
 * @returns Object with relays array and loading state
 */
export function useDMRelays(
  pubkey: string | null,
  ndk: NDK | null
): {
  relays: string[];
  loading: boolean;
  error: string | null;
} {
  const [relays, setRelays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRelays = useCallback(async () => {
    if (!pubkey || !ndk) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Check cache first
      const cached = dmRelayCache.get(pubkey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setRelays(cached.relays);
        setLoading(false);
        return;
      }

      // Fetch from NDK
      const fetchedRelays = await fetchDMRelaysFromNdk(pubkey, ndk);

      // Cache the result
      dmRelayCache.set(pubkey, {
        pubkey,
        relays: fetchedRelays,
        timestamp: Date.now(),
      });

      setRelays(fetchedRelays);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch DM relays';
      setError(errorMsg);
      console.error('useDMRelays error:', err);
    } finally {
      setLoading(false);
    }
  }, [pubkey, ndk]);

  useEffect(() => {
    fetchRelays();
  }, [fetchRelays]);

  return { relays, loading, error };
}

/**
 * Clear the relay cache (useful for manual refresh)
 */
export function clearDMRelayCache(pubkey?: string): void {
  if (pubkey) {
    dmRelayCache.delete(pubkey);
  } else {
    dmRelayCache.clear();
  }
}

/**
 * Get cached relays without fetching
 */
export function getCachedDMRelays(pubkey: string): string[] {
  const cached = dmRelayCache.get(pubkey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.relays;
  }
  return [];
}

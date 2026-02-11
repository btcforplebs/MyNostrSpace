import type NDK from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';
import { NDKRelaySet, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';

export interface EventStats {
  likes: number;
  comments: number;
  reposts: number;
  zaps: number;
  likedByMe: boolean;
  repostedByMe: boolean;
}

type StatsSubscriber = (stats: EventStats) => void;

interface CacheEntry {
  stats: EventStats | null;
  subscribers: Set<StatsSubscriber>;
}

// Singleton cache for event stats
const cache = new Map<string, CacheEntry>();

// Pending event IDs waiting to be batched
let pendingEventIds = new Set<string>();
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
let currentNdk: NDK | null = null;
let currentUserPubkey: string | null = null;

const defaultStats: EventStats = {
  likes: 0,
  comments: 0,
  reposts: 0,
  zaps: 0,
  likedByMe: false,
  repostedByMe: false,
};

export function getStats(eventId: string): EventStats | null {
  return cache.get(eventId)?.stats ?? null;
}

export function subscribeToStats(
  eventId: string,
  ndk: NDK,
  userPubkey: string | undefined,
  callback: StatsSubscriber
): () => void {
  currentNdk = ndk;
  currentUserPubkey = userPubkey ?? null;

  let entry = cache.get(eventId);

  if (!entry) {
    entry = {
      stats: null,
      subscribers: new Set(),
    };
    cache.set(eventId, entry);
  }

  entry.subscribers.add(callback);

  // If we already have stats, call back immediately
  if (entry.stats) {
    callback(entry.stats);
  } else {
    // Queue this event ID for batch fetching
    pendingEventIds.add(eventId);
    scheduleBatchFetch();
  }

  // Return unsubscribe function
  return () => {
    entry!.subscribers.delete(callback);
  };
}

const BATCH_INTERVAL = 500; // Collect for 500ms
const MAX_BATCH_SIZE = 10; // Process 10 events at a time
const MAX_CONCURRENT_STATS = 3; // Only fetch stats for 3 events in parallel

function scheduleBatchFetch(): void {
  if (batchTimeout) return;

  batchTimeout = setTimeout(() => {
    batchTimeout = null;
    executeBatchFetch();
  }, BATCH_INTERVAL);
}

// Simple semaphore for concurrency control
let activeFetches = 0;
const fetchQueue: (() => void)[] = [];

const runThrottled = (fn: () => Promise<void>) => {
  if (activeFetches < MAX_CONCURRENT_STATS) {
    activeFetches++;
    fn().finally(() => {
      activeFetches--;
      if (fetchQueue.length > 0) {
        const next = fetchQueue.shift();
        if (next) runThrottled(next as any); // Type cast for simplicity in this helper
      }
    });
  } else {
    fetchQueue.push(fn as any);
  }
};

import { ANTIPRIMAL_RELAY } from '../utils/antiprimal';

async function executeBatchFetch(): Promise<void> {
  if (pendingEventIds.size === 0 || !currentNdk) return;

  const allEventIds = Array.from(pendingEventIds);
  pendingEventIds = new Set();
  const currentNdkRef = currentNdk;
  const currentUserPubkeyRef = currentUserPubkey;

  // Initialize cache entries
  allEventIds.forEach((id) => {
    let entry = cache.get(id);
    if (!entry) {
      entry = { stats: { ...defaultStats }, subscribers: new Set() };
      cache.set(id, entry);
    } else if (!entry.stats) {
      entry.stats = { ...defaultStats };
    }
  });

  // Split into chunks to avoid massive parallel spikes
  for (let i = 0; i < allEventIds.length; i += MAX_BATCH_SIZE) {
    const chunk = allEventIds.slice(i, i + MAX_BATCH_SIZE);

    // Process chunk's "By Me" interactions (can be batched easily)
    if (currentUserPubkeyRef) {
      fetchUserInteractions(chunk, currentNdkRef, currentUserPubkeyRef);
    }

    // Process chunk's global counts (must be throttled)
    chunk.forEach((id) => {
      runThrottled(() => fetchEventCounts(id, currentNdkRef));
    });
  }
}

async function fetchUserInteractions(eventIds: string[], ndk: NDK, pubkey: string) {
  try {
    const myEvents = await ndk.fetchEvents(
      {
        kinds: [7, 6],
        '#e': eventIds,
        authors: [pubkey],
      },
      { cacheUsage: NDKSubscriptionCacheUsage.PARALLEL }
    );

    myEvents.forEach((e) => {
      const targetId = e.tags.find((t) => t[0] === 'e')?.[1];
      if (!targetId) return;

      updateStats(targetId, (prev) => ({
        ...prev,
        likedByMe: prev.likedByMe || (e.kind === 7 && e.content !== '-'),
        repostedByMe: prev.repostedByMe || e.kind === 6,
      }));
    });
  } catch (err) {
    console.error('Error fetching user interactions:', err);
  }
}

async function fetchEventCounts(id: string, ndk: NDK) {
  try {
    const antiprimalRelaySet = NDKRelaySet.fromRelayUrls(
      [ANTIPRIMAL_RELAY, 'wss://relay.nostr.band'],
      ndk
    );

    // Try to find a relay that supports COUNT (NIP-45)
    // We'll use a standard subscription but keep it extremely short-lived
    // and only for THIS specific event.
    const [likes, comments, reposts, zaps] = await Promise.all([
      countEvents(ndk, { kinds: [7], '#e': [id] }, antiprimalRelaySet),
      countEvents(ndk, { kinds: [1], '#e': [id] }, antiprimalRelaySet),
      countEvents(ndk, { kinds: [6, 16], '#e': [id] }, antiprimalRelaySet),
      countEvents(ndk, { kinds: [9735], '#e': [id] }, antiprimalRelaySet),
    ]);

    updateStats(id, (prev) => ({
      ...prev,
      likes,
      comments,
      reposts,
      zaps,
    }));
  } catch (err) {
    console.error(`Error fetching counts for ${id}:`, err);
  }
}

async function countEvents(ndk: NDK, filter: NDKFilter, relaySet: NDKRelaySet): Promise<number> {
  return new Promise((resolve) => {
    // 1. Try NIP-45 COUNT if possible via direct relay access
    // This is much faster and lighter if supported
    const relays = Array.from(relaySet.relays);
    const relayWithCount = relays.find((r) => (r as any).count !== undefined);

    if (relayWithCount) {
      (relayWithCount as any)
        .count([filter], { id: Math.random().toString(36).substring(7) })
        .then((res: any) => resolve(typeof res === 'number' ? res : res.count || 0))
        .catch(() => {
          // Fallback to manual count if COUNT fails
          manualCount(ndk, filter, relaySet, resolve);
        });
    } else {
      manualCount(ndk, filter, relaySet, resolve);
    }
  });
}

function manualCount(
  ndk: NDK,
  filter: NDKFilter,
  relaySet: NDKRelaySet,
  resolve: (n: number) => void
) {
  const sub = ndk.subscribe(filter, {
    closeOnEose: true,
    groupable: false,
    relaySet,
  });

  let count = 0;
  sub.on('event', () => {
    count++;
  });
  sub.on('eose', () => {
    sub.stop();
    resolve(count);
  });

  setTimeout(() => {
    sub.stop();
    resolve(count);
  }, 2000); // 2s timeout for manual count
}

// Update stats after user interaction (like, repost, etc.)
export function updateStats(eventId: string, updater: (prev: EventStats) => EventStats): void {
  const entry = cache.get(eventId);
  if (entry && entry.stats) {
    entry.stats = updater(entry.stats);
    entry.subscribers.forEach((callback) => {
      try {
        callback(entry.stats!);
      } catch (err) {
        console.error('Error in stats subscriber:', err);
      }
    });
  }
}

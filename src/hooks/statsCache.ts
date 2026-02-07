import type NDK from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';

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

function scheduleBatchFetch(): void {
  if (batchTimeout) return; // Already scheduled

  batchTimeout = setTimeout(() => {
    batchTimeout = null;
    executeBatchFetch();
  }, 150); // Wait 150ms to collect more event IDs
}

async function executeBatchFetch(): Promise<void> {
  if (pendingEventIds.size === 0 || !currentNdk) return;

  const eventIds = Array.from(pendingEventIds);
  pendingEventIds = new Set();

  try {
    // Single query for ALL pending event IDs
    const filter: NDKFilter = {
      '#e': eventIds,
      kinds: [7, 1, 6, 9735],
    };

    const relatedEvents = await currentNdk.fetchEvents(filter);

    // Initialize stats for all requested events
    const statsMap = new Map<string, EventStats>();
    eventIds.forEach((id) => {
      statsMap.set(id, { ...defaultStats });
    });

    // Process all related events
    relatedEvents.forEach((e) => {
      // Find which event this relates to
      const eTag = e.tags.find((t) => t[0] === 'e');
      if (!eTag) return;

      const targetEventId = eTag[1];
      const stats = statsMap.get(targetEventId);
      if (!stats) return;

      if (e.kind === 7) {
        stats.likes++;
        if (currentUserPubkey && e.pubkey === currentUserPubkey) {
          stats.likedByMe = true;
        }
      } else if (e.kind === 6) {
        stats.reposts++;
        if (currentUserPubkey && e.pubkey === currentUserPubkey) {
          stats.repostedByMe = true;
        }
      } else if (e.kind === 1) {
        stats.comments++;
      } else if (e.kind === 9735) {
        stats.zaps++;
      }
    });

    // Update cache and notify subscribers
    statsMap.forEach((stats, eventId) => {
      const entry = cache.get(eventId);
      if (entry) {
        entry.stats = stats;
        entry.subscribers.forEach((callback) => {
          try {
            callback(stats);
          } catch (err) {
            console.error('Error in stats subscriber:', err);
          }
        });
      }
    });
  } catch (error) {
    console.error('Error fetching batched stats:', error);
    // On error, clear pending so components can retry
    eventIds.forEach((id) => {
      const entry = cache.get(id);
      if (entry && !entry.stats) {
        entry.stats = { ...defaultStats };
        entry.subscribers.forEach((cb) => cb(entry.stats!));
      }
    });
  }
}

// Update stats after user interaction (like, repost, etc.)
export function updateStats(
  eventId: string,
  updater: (prev: EventStats) => EventStats
): void {
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

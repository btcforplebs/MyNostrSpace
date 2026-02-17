import type NDK from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';
import { NDKRelaySet } from '@nostr-dev-kit/ndk';

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

const BATCH_INTERVAL = 800; // Collect for 800ms to batch more items together

function scheduleBatchFetch(): void {
  if (batchTimeout) return;

  batchTimeout = setTimeout(() => {
    batchTimeout = null;
    executeBatchFetch();
  }, BATCH_INTERVAL);
}

// Helper to process a batch of events
async function processBatch(
  eventIds: string[],
  ndk: NDK,
  currentUserPubkeyRef: string | null
): Promise<void> {
  const statsRelaySet = NDKRelaySet.fromRelayUrls(
    ['wss://relay.damus.io', 'wss://nos.lol', 'wss://antiprimal.net'],
    ndk
  );

  // 1. Initialize stats for all IDs to ensure we don't leave them null
  eventIds.forEach((id) => {
    updateStats(id, (prev) => prev); // Triggers initial emission if needed or just ensures existence
  });

  // 2. Fetch all interactions in one go
  // We want: Likes (7), Reposts (6), Zaps (9735), Replies (1), Generic Reposts (16)
  const filter: NDKFilter = {
    kinds: [1, 6, 7, 16, 9735],
    '#e': eventIds,
  };

  const sub = ndk.subscribe(filter, {
    closeOnEose: true, // We only need current counts, not live updates for now (can change if needed)
    groupable: false,
    relaySet: statsRelaySet,
  });

  // Temporary map to hold counts before updating state to avoid too many re-renders
  const tempCounts = new Map<string, EventStats>();

  // Initialize temp counts
  eventIds.forEach((id) => {
    const current = cache.get(id)?.stats || { ...defaultStats };
    tempCounts.set(id, { ...current });
  });

  sub.on('event', (e) => {
    // Find which event this interaction is for
    // Check 'e' tags. The standard is the last 'e' tag is the "root" or "reply" target usually,
    // but for simple reactions, any 'e' tag match counts.
    // However, to be precise, we should check all 'e' tags to see which ones match our batch.
    const targetIds = e.tags.filter((t) => t[0] === 'e' && eventIds.includes(t[1])).map((t) => t[1]);

    targetIds.forEach((targetId) => {
      const stats = tempCounts.get(targetId);
      if (!stats) return;

      if (e.kind === 7) {
        stats.likes++;
        if (currentUserPubkeyRef && e.pubkey === currentUserPubkeyRef && e.content !== '-') {
          stats.likedByMe = true;
        }
      } else if (e.kind === 6 || e.kind === 16) {
        stats.reposts++;
        if (currentUserPubkeyRef && e.pubkey === currentUserPubkeyRef) {
          stats.repostedByMe = true;
        }
      } else if (e.kind === 1) {
        stats.comments++;
      } else if (e.kind === 9735) {
        stats.zaps++;
      }
    });
  });

  return new Promise<void>((resolve) => {
    const safetyTimeout = setTimeout(() => {
      sub.stop();
      tempCounts.forEach((stats, id) => {
        updateStats(id, () => stats);
      });
      resolve();
    }, 4000);

    sub.on('eose', () => {
      clearTimeout(safetyTimeout);
      tempCounts.forEach((stats, id) => {
        updateStats(id, () => stats);
      });
      sub.stop();
      resolve();
    });
  });
}

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

  // Split into chunks and process sequentially with delays to avoid relay overload
  const CHUNK_SIZE = 30;
  for (let i = 0; i < allEventIds.length; i += CHUNK_SIZE) {
    const chunk = allEventIds.slice(i, i + CHUNK_SIZE);
    await processBatch(chunk, currentNdkRef, currentUserPubkeyRef);
    // Small delay between chunks to let the main thread breathe
    if (i + CHUNK_SIZE < allEventIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
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

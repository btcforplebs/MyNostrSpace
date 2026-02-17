import type NDK from '@nostr-dev-kit/ndk';
import { type NDKUserProfile, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';

export interface ExtendedProfile extends NDKUserProfile {
  website?: string;
  lud16?: string;
  banner?: string;
}

type Subscriber = (profile: ExtendedProfile | null) => void;

interface CacheEntry {
  profile: ExtendedProfile | null;
  subscribers: Set<Subscriber>;
  fetchPromise: Promise<void> | null;
}

// Singleton cache for profiles
const cache = new Map<string, CacheEntry>();

// Normalize pubkey to hex format for consistent cache keys
function normalizeKey(pubkey: string, ndk: NDK): string {
  if (pubkey.startsWith('npub') || pubkey.startsWith('nprofile')) {
    const user = ndk.getUser({
      [pubkey.startsWith('npub') ? 'npub' : 'nprofile']: pubkey,
    });
    return user.pubkey;
  }
  return pubkey;
}

export function getProfile(pubkey: string): ExtendedProfile | null {
  const entry = cache.get(pubkey);
  return entry?.profile ?? null;
}

export function subscribeToProfile(pubkey: string, ndk: NDK, callback: Subscriber): () => void {
  const normalizedKey = normalizeKey(pubkey, ndk);

  let entry = cache.get(normalizedKey);

  if (!entry) {
    entry = {
      profile: null,
      subscribers: new Set(),
      fetchPromise: null,
    };
    cache.set(normalizedKey, entry);
  }

  entry.subscribers.add(callback);

  // If we already have a profile, call back immediately
  if (entry.profile) {
    callback(entry.profile);
  }

  // If no fetch in progress, start one
  if (!entry.fetchPromise) {
    entry.fetchPromise = fetchProfile(normalizedKey, ndk, entry);
  }

  // Return unsubscribe function
  return () => {
    entry!.subscribers.delete(callback);
  };
}

// Concurrency limiter to avoid slamming relays with 50+ simultaneous profile fetches
// Safari is especially sensitive to concurrent WebSocket frames
let activeFetches = 0;
const MAX_CONCURRENT_FETCHES = 5;
const fetchQueue: Array<() => void> = [];

function runNextInQueue(): void {
  if (fetchQueue.length > 0 && activeFetches < MAX_CONCURRENT_FETCHES) {
    const next = fetchQueue.shift();
    if (next) next();
  }
}

async function fetchProfile(normalizedKey: string, ndk: NDK, entry: CacheEntry): Promise<void> {
  // Check if NDK already has it cached (no relay hit needed)
  const user = ndk.getUser({ pubkey: normalizedKey });
  if (user.profile) {
    entry.profile = user.profile as ExtendedProfile;
    notifySubscribers(entry);
    entry.fetchPromise = null;
    return;
  }

  // Queue the relay fetch if too many are in-flight
  if (activeFetches >= MAX_CONCURRENT_FETCHES) {
    await new Promise<void>((resolve) => {
      fetchQueue.push(resolve);
    });
  }

  activeFetches++;
  try {
    await Promise.race([
      user.fetchProfile({ cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
    ]).catch(() => {
      // Timeout or failure - silently continue
    });

    if (user.profile) {
      entry.profile = user.profile as ExtendedProfile;
      notifySubscribers(entry);
    }
  } catch (e) {
    console.error('Error fetching profile:', e);
  } finally {
    activeFetches--;
    entry.fetchPromise = null;
    runNextInQueue();
  }
}

function notifySubscribers(entry: CacheEntry): void {
  entry.subscribers.forEach((callback) => {
    try {
      callback(entry.profile);
    } catch (e) {
      console.error('Error in profile subscriber:', e);
    }
  });
}

// Update cache when user publishes their own profile
export function updateCachedProfile(pubkey: string, profile: ExtendedProfile): void {
  const entry = cache.get(pubkey);
  if (entry) {
    entry.profile = profile;
    notifySubscribers(entry);
  } else {
    cache.set(pubkey, {
      profile,
      subscribers: new Set(),
      fetchPromise: null,
    });
  }
}

// Bulk load profiles from cache into memory
export async function warmupCache(pubkeys: string[], ndk: NDK): Promise<number> {
  const uniqueKeys = [...new Set(pubkeys)].filter((pk) => !cache.has(pk));
  let loadedCount = 0;

  // Process in chunks to avoid blocking the UI
  const chunkSize = 50;
  for (let i = 0; i < uniqueKeys.length; i += chunkSize) {
    const chunk = uniqueKeys.slice(i, i + chunkSize);

    await Promise.all(
      chunk.map(async (pk) => {
        try {
          // normalizeKey is internal, so we just use the pubkey directly as NDK handles it
          // We rely on ndk.getUser to utilize the cache adapter
          const user = ndk.getUser({ pubkey: pk });

          // We want to fetch from CACHE ONLY (local DB), not network
          // If it's not in DB, we don't want to spam relays during warmup
          await user.fetchProfile({ cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST });

          if (user.profile) {
            updateCachedProfile(user.pubkey, user.profile as ExtendedProfile);
            loadedCount++;
          }
        } catch {
          // Ignore errors during warmup
        }
      })
    );

    // Small yield to let UI breathe
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return loadedCount;
}

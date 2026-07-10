const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes

export const getCachedData = <T>(key: string): T | null => {
  try {
    const item = localStorage.getItem(`cache_${key}`);
    if (!item) return null;

    const { data, expiry } = JSON.parse(item);
    // A missing/corrupt expiry must be treated as expired — `Date.now() > undefined`
    // is false, which would otherwise return stale data forever.
    if (typeof expiry !== 'number' || Date.now() > expiry) {
      localStorage.removeItem(`cache_${key}`);
      return null;
    }
    return data as T;
  } catch (e) {
    console.error('Error reading from cache', e);
    return null;
  }
};

// Remove every expired (or malformed) cache_* entry. Runs on quota errors and is
// exported so the app can sweep on startup, since entries written once and never
// re-read are otherwise only cleaned up on read of that exact key.
export const sweepExpiredCache = (): void => {
  try {
    const now = Date.now();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('cache_')) continue;
      try {
        const item = localStorage.getItem(k);
        if (!item) continue;
        const { expiry } = JSON.parse(item);
        if (typeof expiry !== 'number' || now > expiry) {
          localStorage.removeItem(k);
        }
      } catch {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {
    console.error('Error sweeping cache', e);
  }
};

export const setCachedData = <T>(key: string, data: T, ttl: number = DEFAULT_TTL): void => {
  const item = {
    data,
    expiry: Date.now() + ttl,
  };
  try {
    localStorage.setItem(`cache_${key}`, JSON.stringify(item));
  } catch {
    // Most likely the quota is full — purge expired entries and retry once
    // rather than silently leaving the cache permanently unwritable.
    sweepExpiredCache();
    try {
      localStorage.setItem(`cache_${key}`, JSON.stringify(item));
    } catch (e) {
      console.error('Error writing to cache', e);
    }
  }
};

export const clearCache = (key: string): void => {
  localStorage.removeItem(`cache_${key}`);
};

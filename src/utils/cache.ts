const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes

export const getCachedData = <T>(key: string): T | null => {
  try {
    const item = localStorage.getItem(`cache_${key}`);
    if (!item) return null;

    const { data, expiry } = JSON.parse(item);
    if (Date.now() > expiry) {
      localStorage.removeItem(`cache_${key}`);
      return null;
    }
    return data as T;
  } catch (e) {
    console.error('Error reading from cache', e);
    return null;
  }
};

export const setCachedData = <T>(key: string, data: T, ttl: number = DEFAULT_TTL): void => {
  try {
    const item = {
      data,
      expiry: Date.now() + ttl,
    };
    localStorage.setItem(`cache_${key}`, JSON.stringify(item));
  } catch (e) {
    console.error('Error writing to cache', e);
  }
};

export const clearCache = (key: string): void => {
  localStorage.removeItem(`cache_${key}`);
};

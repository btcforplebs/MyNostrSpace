import { useCallback, useRef } from 'react';
import NDK from '@nostr-dev-kit/ndk';

export function useFollows(ndk: NDK | undefined, user: { pubkey: string } | null) {
    const followsCacheRef = useRef<string[]>([]);
    const followsFetchedRef = useRef(false);

    const getFollows = useCallback(async () => {
        if (!ndk || !user) return [];

        // Return in-memory cache immediately if available
        if (followsCacheRef.current.length > 0) {
            return followsCacheRef.current;
        }

        // Try localStorage cache for instant start while we refresh from network
        const storageKey = `mynostrspace_follows_${user.pubkey}`;
        const cached = localStorage.getItem(storageKey);
        if (cached && !followsFetchedRef.current) {
            try {
                const parsed = JSON.parse(cached) as string[];
                if (parsed.length > 0) {
                    followsCacheRef.current = parsed;
                }
            } catch {
                /* ignore bad cache */
            }
        }

        // Start fetching from network if not already started
        if (!followsFetchedRef.current) {
            followsFetchedRef.current = true;

            const activeUser = ndk.getUser({ pubkey: user.pubkey });
            const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
                return Promise.race([
                    promise,
                    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
                ]);
            };

            // If we have cached follows, fetch network data in background (don't block)
            const fetchFromNetwork = async () => {
                try {
                    const followedUsersSet = await withTimeout(
                        activeUser.follows().catch(() => new Set<import('@nostr-dev-kit/ndk').NDKUser>()),
                        3000,
                        new Set<import('@nostr-dev-kit/ndk').NDKUser>()
                    );
                    const followPubkeys = Array.from(followedUsersSet || new Set()).map((u) => u.pubkey);
                    if (!followPubkeys.includes(user.pubkey)) followPubkeys.push(user.pubkey);
                    if (followPubkeys.length > 0) {
                        followsCacheRef.current = followPubkeys;
                        localStorage.setItem(storageKey, JSON.stringify(followPubkeys));
                    }
                } catch {
                    if (followsCacheRef.current.length === 0) {
                        followsCacheRef.current = [user.pubkey];
                    }
                }
            };

            if (followsCacheRef.current.length > 0) {
                // We have stale data - return it now, refresh in background
                fetchFromNetwork();
            } else {
                // No cache at all - must wait for network
                await fetchFromNetwork();
                if (followsCacheRef.current.length === 0) {
                    followsCacheRef.current = [user.pubkey];
                }
            }
        } else {
            // If fetch is in progress, wait for it to complete (but not indefinitely)
            let attempts = 0;
            while (followsCacheRef.current.length === 0 && attempts < 30) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                attempts++;
            }
        }

        return followsCacheRef.current;
    }, [ndk, user]);

    return { getFollows };
}

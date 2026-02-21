import { useState, useCallback } from 'react';
import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import NDK from '@nostr-dev-kit/ndk';
import { filterRelays } from '../utils/relay';

interface Stats {
    followers: number | null;
    posts: number | null;
    zaps: number | null;
}

export function useProfileStats(
    ndk: NDK | undefined,
    user: { pubkey: string } | null,
    allBlockedPubkeys: Set<string>
) {
    const [stats, setStats] = useState<Stats>({
        followers: null,
        posts: null,
        zaps: null,
    });
    const [loadingStats, setLoadingStats] = useState(false);

    const fetchStats = useCallback(async () => {
        if (loadingStats || !ndk || !user?.pubkey) return;
        setLoadingStats(true);

        // Reset stats to 0 to start counting up
        setStats({ followers: 0, posts: 0, zaps: 0 });

        try {
            // 1. Get User's Preferred Relays (Kind 10002)
            const relayEvent = await ndk.fetchEvent({ kinds: [10002], authors: [user.pubkey] });
            const userRelays = relayEvent
                ? filterRelays(relayEvent.tags.filter((t) => t[0] === 'r').map((t) => t[1]))
                : [];

            // 2. Combine with forceful relays for better stats (Antiprimal is key for history/counts)
            const allRelays = [
                ...userRelays,
                'wss://antiprimal.net',
                'wss://relay.damus.io',
                'wss://nos.lol',
            ];

            const targetRelays = NDKRelaySet.fromRelayUrls(allRelays, ndk);

            // Track unique IDs to prevent duplicates affecting counts
            const uniqueFollowers = new Set<string>();
            const uniquePostIds = new Set<string>();
            const uniqueZapIds = new Set<string>();

            // 2. Start Subscriptions (Streaming) with Throttled Updates
            let currentFollowers = 0;
            let currentPosts = 0;
            let currentZaps = 0;
            let updateTimeout: ReturnType<typeof setTimeout> | null = null;

            const scheduleUpdate = () => {
                if (updateTimeout) return;
                updateTimeout = setTimeout(() => {
                    setStats({
                        followers: currentFollowers,
                        posts: currentPosts,
                        zaps: currentZaps,
                    });
                    updateTimeout = null;
                }, 500); // Update UI every 500ms at most
            };

            // Follower count: use ONLY Antiprimal to avoid downloading massive Kind 3 events
            // from multiple relays. Each Kind 3 event is 50-100KB+ (contains ALL of someone's follows).
            const antiprimalOnly = NDKRelaySet.fromRelayUrls(['wss://antiprimal.net'], ndk);
            const followersSub = ndk.subscribe(
                { kinds: [3], '#p': [user.pubkey] },
                { closeOnEose: true, relaySet: antiprimalOnly }
            );

            const postsSub = ndk.subscribe(
                { kinds: [1], authors: [user.pubkey] },
                { closeOnEose: true, relaySet: targetRelays }
            );

            const zapsSub = ndk.subscribe(
                { kinds: [9735], '#p': [user.pubkey] },
                { closeOnEose: true, relaySet: targetRelays }
            );

            followersSub.on('event', (ev: NDKEvent) => {
                if (!uniqueFollowers.has(ev.pubkey) && !allBlockedPubkeys.has(ev.pubkey)) {
                    uniqueFollowers.add(ev.pubkey);
                    currentFollowers = uniqueFollowers.size;
                    scheduleUpdate();
                }
            });

            postsSub.on('event', (ev: NDKEvent) => {
                if (!uniquePostIds.has(ev.id)) {
                    uniquePostIds.add(ev.id);
                    currentPosts = uniquePostIds.size;
                    scheduleUpdate();
                }
            });

            zapsSub.on('event', (ev: NDKEvent) => {
                if (uniqueZapIds.has(ev.id)) return;
                uniqueZapIds.add(ev.id);

                let amt = 0;
                const amountTag = ev.tags.find((t) => t[0] === 'amount');
                if (amountTag) {
                    amt = parseInt(amountTag[1]) / 1000;
                } else {
                    const bolt11 = ev.tags.find((t) => t[0] === 'bolt11')?.[1];
                    if (bolt11) {
                        const match = bolt11.match(/lnbc(\d+)([pnum])1/);
                        if (match) {
                            let val = parseInt(match[1]);
                            const multiplier = match[2];
                            if (multiplier === 'm') val *= 100000;
                            else if (multiplier === 'u') val *= 100;
                            else if (multiplier === 'n') val *= 0.1;
                            else if (multiplier === 'p') val *= 0.0001;
                            amt = val;
                        }
                    }
                }
                if (amt > 0) {
                    currentZaps = Math.floor(currentZaps + amt);
                    scheduleUpdate();
                }
            });

            let finishedCount = 0;
            const onDone = () => {
                finishedCount++;
                if (finishedCount >= 3) {
                    setLoadingStats(false);
                    // Final flush to ensure latest numbers are shown
                    if (updateTimeout) {
                        clearTimeout(updateTimeout);
                        setStats({
                            followers: currentFollowers,
                            posts: currentPosts,
                            zaps: currentZaps,
                        });
                        updateTimeout = null;
                    }
                }
            };

            followersSub.on('eose', onDone);
            postsSub.on('eose', onDone);
            zapsSub.on('eose', onDone);

            // Safety timeout
            setTimeout(() => setLoadingStats(false), 20000); // Increased timeout for more relays
        } catch (e) {
            console.error('Error starting stats stream:', e);
            setLoadingStats(false);
        }
    }, [loadingStats, ndk, user, allBlockedPubkeys]);

    return { stats, loadingStats, fetchStats };
}

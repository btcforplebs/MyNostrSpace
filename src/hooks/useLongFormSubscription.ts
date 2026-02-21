import { useState, useEffect } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import NDK from '@nostr-dev-kit/ndk';

export function useLongFormSubscription(
    ndk: NDK | undefined,
    user: { pubkey: string } | null,
    viewMode: string,
    getFollows: () => Promise<string[]>
) {
    const [blogEvents, setBlogEvents] = useState<NDKEvent[]>([]);
    const [streamEvents, setStreamEvents] = useState<NDKEvent[]>([]);

    useEffect(() => {
        if (!ndk || !user || (viewMode !== 'blog' && viewMode !== 'streams')) return;
        let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;
        const start = async () => {
            const authors = await getFollows();
            const kind = viewMode === 'blog' ? [30023] : [30311];
            sub = ndk.subscribe({ kinds: kind, authors, limit: 20 }, { closeOnEose: true });
            sub.on('event', (ev: NDKEvent) => {
                if (viewMode === 'blog') {
                    setBlogEvents((prev) => {
                        const dTag = ev.getMatchingTags('d')[0]?.[1];
                        if (!dTag) return prev; // Ignore if no d tag for replaceable
                        const filtered = prev.filter((e) => {
                            const eDTag = e.getMatchingTags('d')[0]?.[1];
                            return !(e.pubkey === ev.pubkey && eDTag === dTag);
                        });
                        return [...filtered, ev].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
                    });
                } else if (viewMode === 'streams') {
                    setStreamEvents((prev) => {
                        const dTag = ev.getMatchingTags('d')[0]?.[1];
                        if (!dTag) return prev; // Ignore if no d tag
                        const filtered = prev.filter((e) => {
                            const eDTag = e.getMatchingTags('d')[0]?.[1];
                            return !(e.pubkey === ev.pubkey && eDTag === dTag);
                        });
                        return [...filtered, ev].sort((a, b) => {
                            const aStatus = a.tags.find((t) => t[0] === 'status')?.[1] || 'ended';
                            const bStatus = b.tags.find((t) => t[0] === 'status')?.[1] || 'ended';
                            if (aStatus === 'live' && bStatus !== 'live') return -1;
                            if (bStatus === 'live' && aStatus !== 'live') return 1;
                            return (b.created_at || 0) - (a.created_at || 0);
                        });
                    });
                }
            });
        };
        start();
        return () => {
            if (sub) sub.stop();
        };
    }, [ndk, user, viewMode, getFollows]);

    return { blogEvents, streamEvents };
}

import { useState, useEffect } from 'react';
import NDK, { NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';
import { FeedItem } from '../Shared/FeedItem';

export const ProfileFeed = ({ ndk, pubkey: hexPubkey }: { ndk: NDK | undefined; pubkey: string }) => {
    const [feed, setFeed] = useState<NDKEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!ndk || !hexPubkey) return;
        setLoading(true);

        const filter: NDKFilter = {
            kinds: [1],
            authors: [hexPubkey],
            limit: 100,
        };


        const sub = ndk.subscribe(filter, {
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
        });

        const newEvents: NDKEvent[] = [];

        sub.on('event', (ev: NDKEvent) => {
            // Exclude replies logic
            const isReply = ev.tags.some((t) => t[0] === 'e' && t.length >= 2);
            if (!isReply) {
                newEvents.push(ev);
                // Throttle updates
                setFeed([...newEvents].sort((a, b) => (b.created_at || 0) - (a.created_at || 0)));
            }
        });

        sub.on('eose', () => {
            newEvents.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
            setFeed(newEvents);
            setLoading(false);
        });

        return () => {
            sub.stop();
        };
    }, [ndk, hexPubkey]);


    if (loading && feed.length === 0) {
        return <div style={{ padding: '20px' }}>Loading Feed...</div>;
    }

    if (feed.length === 0) {
        return <div style={{ padding: '20px' }}>No posts found.</div>;
    }

    return (
        <div className="profile-feed">
            {feed.map((ev) => (
                <FeedItem key={ev.id} event={ev} />
            ))}
        </div>
    );
};

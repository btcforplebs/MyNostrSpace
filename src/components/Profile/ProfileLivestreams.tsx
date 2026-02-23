import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import NDK, { NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';

export const ProfileLivestreams = ({ ndk, pubkey: hexPubkey }: { ndk: NDK | undefined; pubkey: string }) => {
    const [streams, setStreams] = useState<NDKEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!ndk || !hexPubkey) return;
        setLoading(true);

        const filter: NDKFilter = {
            kinds: [30311 as number],
            authors: [hexPubkey],
        };

        const sub = ndk.subscribe(filter, {
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
        });

        const newEvents: NDKEvent[] = [];

        sub.on('event', (ev: NDKEvent) => {
            newEvents.push(ev);
        });

        sub.on('eose', () => {
            newEvents.sort((a, b) => {
                const aStatus = a.getMatchingTags('status')[0]?.[1];
                const bStatus = b.getMatchingTags('status')[0]?.[1];

                // Active streams first
                if (aStatus === 'live' && bStatus !== 'live') return -1;
                if (bStatus === 'live' && aStatus !== 'live') return 1;

                return (b.created_at || 0) - (a.created_at || 0);
            });
            setStreams(newEvents);
            setLoading(false);
        });

        return () => {
            sub.stop();
        };
    }, [ndk, hexPubkey]);

    if (loading) return <div style={{ padding: '20px' }}>Loading Livestreams...</div>;

    if (streams.length === 0) {
        return <div style={{ padding: '20px' }}>No livestreams found for this user.</div>;
    }

    return (
        <div className="streams-list">
            {streams.map((stream) => {
                const title = stream.getMatchingTags('title')[0]?.[1] || 'Untitled Stream';
                const image = stream.getMatchingTags('image')[0]?.[1];
                const status = stream.getMatchingTags('status')[0]?.[1];
                const dTag = stream.getMatchingTags('d')[0]?.[1];
                const summary = stream.getMatchingTags('summary')[0]?.[1] || stream.content || '';

                const url = `/live/${hexPubkey}/${dTag}`;

                return (
                    <Link key={stream.id} to={url} className="stream-list-item">
                        <div className="stream-list-thumb-container">
                            {image ? (
                                <img src={image} alt={title} className="stream-list-thumb" />
                            ) : (
                                <div className="stream-list-no-image">LIVE</div>
                            )}
                            {status === 'live' && <div className="live-badge-overlay">LIVE</div>}
                            {status === 'ended' && (
                                <div
                                    className="live-badge-overlay"
                                    style={{ background: '#666', color: 'white' }}
                                >
                                    ENDED
                                </div>
                            )}
                        </div>
                        <div className="stream-list-info">
                            <div className="stream-list-title">{title}</div>
                            <div className="stream-list-summary">{summary}</div>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
};

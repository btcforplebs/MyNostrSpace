import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import NDK, { NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';

export const ProfileBlog = ({ ndk, pubkey }: { ndk: NDK | undefined; pubkey: string }) => {
    const [posts, setPosts] = useState<NDKEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!ndk || !pubkey) return;
        setLoading(true);

        const filter: NDKFilter = {
            kinds: [30023],
            authors: [pubkey],
        };

        const sub = ndk.subscribe(filter, {
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
        });

        const newEvents: NDKEvent[] = [];

        sub.on('event', (ev: NDKEvent) => {
            // Exclude recipes from the blog tab
            const isRecipe = ev.tags.some((t) => t[0] === 'd' && t[1] === 'recipe');
            if (!isRecipe) {
                newEvents.push(ev);
            }
        });

        sub.on('eose', () => {
            newEvents.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
            setPosts(newEvents);
            setLoading(false);
        });

        return () => {
            sub.stop();
        };
    }, [ndk, pubkey]);

    if (loading) return <div style={{ padding: '20px' }}>Loading Blog Posts...</div>;

    if (posts.length === 0) {
        return <div style={{ padding: '20px' }}>No blog posts found.</div>;
    }

    return (
        <div className="blog-list">
            {posts.map((ev) => {
                const title = ev.tags.find((t) => t[0] === 'title')?.[1] || 'Untitled';
                const summary = ev.tags.find((t) => t[0] === 'summary')?.[1] || ev.content.slice(0, 150) + '...';
                const image = ev.tags.find((t) => t[0] === 'image')?.[1];
                const publishedAt = ev.tags.find((t) => t[0] === 'published_at')?.[1] || ev.created_at;
                const dTag = ev.tags.find((t) => t[0] === 'd')?.[1];

                // Format dates correctly depending if standard timestamp or string
                const dateStr = publishedAt
                    ? new Date(Number(publishedAt) * 1000).toLocaleDateString()
                    : '';

                return (
                    <div key={ev.id} className="blog-list-item">
                        {image && (
                            <div className="blog-list-img-container">
                                <img src={image} alt="" />
                            </div>
                        )}
                        <div className="blog-list-content">
                            <Link to={`/blog/${pubkey}/${dTag}`} className="blog-list-title">
                                {title}
                            </Link>
                            <div className="blog-list-date">{dateStr}</div>
                            <div className="blog-list-summary">{summary}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

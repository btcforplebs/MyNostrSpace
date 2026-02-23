import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import NDK, { NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';

export const ProfileRecipes = ({ ndk, pubkey: hexPubkey }: { ndk: NDK | undefined; pubkey: string }) => {
    const [recipes, setRecipes] = useState<NDKEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!ndk || !hexPubkey) return;
        setLoading(true);

        const filter: NDKFilter = {
            kinds: [30023],
            authors: [hexPubkey],
            '#d': ['recipe'],
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
            newEvents.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
            setRecipes(newEvents);
            setLoading(false);
        });

        return () => {
            sub.stop();
        };
    }, [ndk, hexPubkey]);


    if (loading) return <div style={{ padding: '20px' }}>Loading Recipes...</div>;

    if (recipes.length === 0) {
        return <div style={{ padding: '20px' }}>No recipes found.</div>;
    }

    return (
        <div className="recipes-grid">
            {recipes.map((ev) => {
                const titleTag = ev.tags.find((t) => t[0] === 'title');
                const title = titleTag ? titleTag[1] : 'Untitled Recipe';
                const imageTag = ev.tags.find((t) => t[0] === 'image');
                const image = imageTag ? imageTag[1] : null;
                const summaryTag = ev.tags.find((t) => t[0] === 'summary');
                const summary = summaryTag ? summaryTag[1] : '';

                return (
                    <Link key={ev.id} to={`/recipe/${ev.pubkey}/${ev.id}`} className="recipe-card">
                        {image ? (
                            <img src={image} alt={title} className="recipe-image" />
                        ) : (
                            <div
                                className="recipe-image"
                                style={{
                                    background: '#f0f0f0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#999',
                                }}
                            >
                                No Image
                            </div>
                        )}
                        <div className="recipe-info">
                            <h3 className="recipe-title">{title}</h3>
                            <p className="recipe-summary">{summary}</p>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
};

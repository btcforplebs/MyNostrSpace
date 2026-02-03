import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKKind, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import './BlogsPage.css';

interface BlogArticle {
    id: string;
    pubkey: string;
    identifier: string;
    title: string;
    summary?: string;
    publishedAt: number;
    image?: string;
    authorProfile?: {
        name?: string;
        picture?: string;
    };
}

export const BlogsPage = () => {
    const { ndk } = useNostr();
    const [articles, setArticles] = useState<BlogArticle[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!ndk) return;

        const fetchArticles = async () => {
            setLoading(true);
            try {
                // Fetch recent long-form content (Kind 30023)
                // We can add specific relays or authors later if needed, global for now
                const filter: NDKFilter = {
                    kinds: [30023 as NDKKind],
                    limit: 20
                };

                const events = await ndk.fetchEvents(filter);
                const sortedEvents = Array.from(events).sort((a, b) => {
                    const aTime = a.created_at || 0;
                    const bTime = b.created_at || 0;
                    return bTime - aTime;
                });

                const formattedArticles: BlogArticle[] = [];

                // Process events
                for (const event of sortedEvents) {
                    const title = event.getMatchingTags('title')[0]?.[1] || 'Untitled';
                    const identifier = event.getMatchingTags('d')[0]?.[1];
                    const summary = event.getMatchingTags('summary')[0]?.[1] || event.content.slice(0, 150) + '...';
                    const publishedAt = event.created_at || 0;
                    // Try to find an image in tags or content? content is long markdown.
                    // Look for 'image' tag
                    const image = event.getMatchingTags('image')[0]?.[1];

                    if (identifier) {
                        formattedArticles.push({
                            id: event.id,
                            pubkey: event.pubkey,
                            identifier,
                            title,
                            summary,
                            publishedAt,
                            image
                        });
                    }
                }

                // Fetch authors
                const pubkeys = new Set(formattedArticles.map(a => a.pubkey));
                if (pubkeys.size > 0) {
                    await Promise.all(formattedArticles.map(async (article) => {
                        const user = ndk.getUser({ pubkey: article.pubkey });
                        const profile = await user.fetchProfile();
                        article.authorProfile = {
                            name: profile?.name || profile?.displayName || String(profile?.display_name || ''),
                            picture: profile?.image || profile?.picture
                        };
                    }));
                }

                setArticles(formattedArticles);

            } catch (err) {
                console.error("Failed to fetch blog articles", err);
            } finally {
                setLoading(false);
            }
        };

        fetchArticles();
    }, [ndk]);

    return (
        <div className="blogs-page-container">
            <div className="blogs-header-area">
                <Navbar />
            </div>

            <div className="blogs-content">
                <h2 className="section-header">Recent Blog Entries</h2>

                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center' }}>Loading articles...</div>
                ) : (
                    <div className="blogs-grid">
                        {articles.map((article) => (
                            <div key={article.id} className="blog-card">
                                <div className="blog-card-left">
                                    <Link to={`/p/${article.pubkey}`}>
                                        <img
                                            src={article.authorProfile?.picture || `https://robohash.org/${article.pubkey}?set=set4`}
                                            alt={article.authorProfile?.name}
                                            className="blog-author-pic"
                                        />
                                    </Link>
                                    <Link to={`/p/${article.pubkey}`} className="blog-author-name">
                                        {article.authorProfile?.name || article.pubkey.slice(0, 8)}
                                    </Link>
                                </div>
                                <div className="blog-card-right">
                                    <div className="blog-card-title">
                                        <Link to={`/blog/${article.pubkey}/${article.identifier}`}>
                                            {article.title}
                                        </Link>
                                    </div>
                                    <div className="blog-card-meta">
                                        Posted on {new Date(article.publishedAt * 1000).toLocaleDateString()}
                                    </div>
                                    <div className="blog-card-snippet">
                                        {article.summary}
                                        <Link to={`/blog/${article.pubkey}/${article.identifier}`} className="read-more-link">
                                            (view more)
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!loading && articles.length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center' }}>No articles found. Check back later!</div>
                )}
            </div>
        </div>
    );
};

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKKind, type NDKFilter } from '@nostr-dev-kit/ndk';
import { RichTextRenderer } from '../Shared/RichTextRenderer';
import { Navbar } from '../Shared/Navbar';
import './BlogPage.css';

export const BlogPage: React.FC = () => {
    const { pubkey, identifier } = useParams<{ pubkey: string; identifier: string }>();
    const { ndk } = useNostr();
    const [article, setArticle] = useState<NDKEvent | null>(null);
    const [author, setAuthor] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!ndk || !pubkey || !identifier) return;

        const fetchArticle = async () => {
            setLoading(true);
            try {
                const filter: NDKFilter = {
                    kinds: [30023 as NDKKind],
                    authors: [pubkey],
                    '#d': [identifier],
                };
                const event = await ndk.fetchEvent(filter);
                if (event) {
                    setArticle(event);
                    const user = ndk.getUser({ pubkey });
                    const profile = await user.fetchProfile();
                    setAuthor(profile);
                }
            } catch (error) {
                console.error('Failed to fetch article:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchArticle();
    }, [ndk, pubkey, identifier]);

    if (loading) {
        return (
            <div className="blog-container loading">
                <div className="blog-header">
                    <div className="blog-title-box">Loading Article...</div>
                </div>
                <div className="blog-body">
                    <div className="skeleton skeleton-article-title"></div>
                    <div className="skeleton skeleton-article-body"></div>
                </div>
            </div>
        );
    }

    if (!article) {
        return (
            <div className="blog-container error">
                <div className="blog-header">
                    <div className="blog-title-box">Article Not Found</div>
                </div>
                <div className="blog-body">
                    <p>Sorry, we couldn't find the article you're looking for.</p>
                    <Link to="/" className="retro-link">Go Back Home</Link>
                </div>
            </div>
        );
    }

    const title = article.getMatchingTags('title')[0]?.[1] || 'Untitled Article';
    const publishedAt = article.getMatchingTags('published_at')[0]?.[1];
    const dateStr = publishedAt
        ? new Date(parseInt(publishedAt) * 1000).toLocaleDateString()
        : new Date(article.created_at! * 1000).toLocaleDateString();

    return (
        <div className="blog-page-wrapper">
            <Navbar />
            <div className="blog-container">
                <header className="blog-header">
                    <div className="blog-logo-area">
                        <Link to="/" className="blog-home-link">
                            <img src="/mynostrspace_logo.png" alt="MyNostrSpace" className="blog-mini-logo" />
                            <span className="blog-brand">MyNostrSpace Blog</span>
                        </Link>
                    </div>
                    <div className="blog-title-box">
                        <h2>{author?.name || author?.displayName || author?.display_name || pubkey?.slice(0, 8)}'s Journal</h2>
                    </div>
                </header>

                <div className="blog-layout">
                    <aside className="blog-sidebar">
                        <div className="author-box">
                            <div className="author-pic">
                                <Link to={`/p/${pubkey}`}>
                                    <img src={author?.picture || `https://robohash.org/${pubkey}?set=set4`} alt={author?.name} />
                                </Link>
                            </div>
                            <div className="author-info">
                                <Link to={`/p/${pubkey}`} className="author-name">
                                    {author?.name || 'Anonymous'}
                                </Link>
                                <div className="author-about">{author?.about?.slice(0, 100)}</div>
                            </div>
                        </div>
                        <div className="sidebar-links">
                            <Link to="/">Home</Link>
                            <Link to={`/p/${pubkey}`}>View Profile</Link>
                        </div>
                    </aside>

                    <main className="blog-main">
                        <article className="blog-post">
                            <div className="post-header">
                                <h1 className="post-title">{title}</h1>
                                <div className="post-date">Posted on {dateStr}</div>
                            </div>
                            <div className="post-content">
                                <RichTextRenderer content={article.content} />
                            </div>
                        </article>
                    </main>
                </div>

                <footer className="blog-footer">
                    <div>© 2003-2026 mynostrspace.com. All Rights Reserved.</div>
                </footer>
            </div>
        </div>
    );
};

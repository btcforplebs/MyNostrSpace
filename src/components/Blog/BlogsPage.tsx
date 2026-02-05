import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { type NDKFilter, NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import { SEO } from '../Shared/SEO';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { BlogEditor } from '../Home/BlogEditor';
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
  const { ndk, user: loggedInUser } = useNostr();
  const { layoutCss } = useCustomLayout(loggedInUser?.pubkey);
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBlogEditorOpen, setIsBlogEditorOpen] = useState(false);

  useEffect(() => {
    if (!ndk) return;

    let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;

    const fetchArticles = async () => {
      setLoading(true);
      try {
        const filter: NDKFilter = {
          kinds: [30023],
          limit: 50,
        };

        const processBlogEvent = (event: NDKEvent) => {
          const identifier = event.getMatchingTags('d')[0]?.[1];
          if (!identifier) return;

          const title = event.getMatchingTags('title')[0]?.[1] || 'Untitled';
          const summary =
            event.getMatchingTags('summary')[0]?.[1] || event.content.slice(0, 150) + '...';
          const publishedAt = event.created_at || 0;
          const image = event.getMatchingTags('image')[0]?.[1];

          setArticles((prev) => {
            if (prev.find((a) => a.id === event.id)) return prev;
            const newArticle: BlogArticle = {
              id: event.id,
              pubkey: event.pubkey,
              identifier,
              title,
              summary,
              publishedAt,
              image,
            };
            const next = [...prev, newArticle];
            return next.sort((a, b) => b.publishedAt - a.publishedAt);
          });

          // Proactively fetch profile
          event.author
            .fetchProfile()
            .then((profile) => {
              if (profile) {
                setArticles((prev) =>
                  prev.map((a) =>
                    a.pubkey === event.pubkey
                      ? {
                          ...a,
                          authorProfile: {
                            name: String(
                              profile.name ||
                                profile.displayName ||
                                profile.display_name ||
                                a.pubkey.slice(0, 8)
                            ),
                            picture: profile.image || profile.picture,
                          },
                        }
                      : a
                  )
                );
              }
            })
            .catch(() => {});
        };

        sub = ndk.subscribe(filter, {
          closeOnEose: false,
          cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
        });

        sub.on('event', (apiEvent: NDKEvent) => {
          processBlogEvent(apiEvent);
        });

        sub.on('eose', () => {
          setLoading(false);
          console.log('Blogs Page: Initial fetch complete');
        });
      } catch (err) {
        console.error('Failed to fetch blog articles', err);
        setLoading(false);
      }
    };

    fetchArticles();

    return () => {
      if (sub) sub.stop();
    };
  }, [ndk]);

  return (
    <div className="home-page-container bp-page-container">
      {layoutCss && <style>{layoutCss}</style>}
      <SEO
        title="Blogs"
        description="Read long-form articles and stories from the Nostr network."
      />

      <div className="home-wrapper bp-wrapper">
        <Navbar />

        <div className="home-content bp-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="bp-section-header" style={{ margin: 0 }}>
              Recent Blog Entries
            </h2>
            {loggedInUser && (
              <button
                onClick={() => setIsBlogEditorOpen(true)}
                style={{
                  background: '#ff9933',
                  color: 'white',
                  border: '1px solid #cc7a29',
                  padding: '5px 12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '9pt',
                }}
              >
                Write New Blog
              </button>
            )}
          </div>

          {loading && articles.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>Loading articles...</div>
          ) : (
            <div className="bp-grid">
              {articles.map((article) => (
                <div key={article.id} className="bp-card">
                  <div className="bp-card-left">
                    <Link to={`/p/${article.pubkey}`}>
                      <img
                        src={
                          article.authorProfile?.picture ||
                          `https://robohash.org/${article.pubkey}?set=set4`
                        }
                        alt={article.authorProfile?.name}
                        className="bp-author-pic"
                      />
                    </Link>
                    <Link to={`/p/${article.pubkey}`} className="bp-author-name">
                      {article.authorProfile?.name || article.pubkey.slice(0, 8)}
                    </Link>
                  </div>
                  <div className="bp-card-right">
                    <div className="bp-card-title">
                      <Link to={`/blog/${article.pubkey}/${article.identifier}`}>
                        {article.title}
                      </Link>
                    </div>
                    <div className="bp-card-meta">
                      Posted on {new Date(article.publishedAt * 1000).toLocaleDateString()}
                    </div>
                    <div className="bp-card-snippet">
                      {article.summary}
                      <Link
                        to={`/blog/${article.pubkey}/${article.identifier}`}
                        className="bp-read-more"
                      >
                        (view more)
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && articles.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              No articles found. Check back later!
            </div>
          )}
        </div>
      </div>

      <BlogEditor
        isOpen={isBlogEditorOpen}
        onClose={() => setIsBlogEditorOpen(false)}
        onPostComplete={() => {}}
      />
    </div>
  );
};

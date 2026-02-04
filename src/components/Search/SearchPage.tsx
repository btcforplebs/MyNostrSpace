import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKRelaySet, NDKEvent } from '@nostr-dev-kit/ndk';

import { Navbar } from '../Shared/Navbar';

interface SearchResult {
  id: string;
  type: 'profile' | 'note' | 'article';
  pubkey: string;
  content: string; // Bio for profile, text for note, summary/content for article
  title?: string; // Name for profile, Title for article
  image?: string; // Avatar for profile, Image for article
  createdAt?: number;
}

export const SearchPage = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const { ndk } = useNostr();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || !ndk) return;

    const performSearch = async () => {
      setLoading(true);
      setResults([]);

      try {
        const relaySet = NDKRelaySet.fromRelayUrls(
          ['wss://purplepag.es', 'wss://relay.damus.io', 'wss://nos.lol'],
          ndk
        );

        const sub = ndk.subscribe(
          {
            kinds: [0, 1, 30023],
            search: query,
            limit: 50,
          },
          {
            closeOnEose: false,
            groupable: false,
            subId: `search-${Date.now()}`,
            relaySet, // Correct usage per warning
          }
        );

        const foundItems = new Map<string, SearchResult>();

        sub.on('event', (event: NDKEvent) => {
          try {
            let item: SearchResult | undefined;

            if (event.kind === 0) {
              const profile = JSON.parse(event.content);
              item = {
                id: event.pubkey, // Use pubkey as ID for profiles to dedupe
                type: 'profile',
                pubkey: event.pubkey,
                title: profile.name || profile.display_name,
                image: profile.picture,
                content: profile.about || '',
                createdAt: event.created_at,
              };
            } else if (event.kind === 1) {
              item = {
                id: event.id,
                type: 'note',
                pubkey: event.pubkey,
                content: event.content,
                createdAt: event.created_at,
              };
            } else if (event.kind === 30023) {
              const title = event.tags.find((t) => t[0] === 'title')?.[1];
              const image = event.tags.find((t) => t[0] === 'image')?.[1];
              const summary = event.tags.find((t) => t[0] === 'summary')?.[1];

              item = {
                id: event.id,
                type: 'article',
                pubkey: event.pubkey,
                title: title || 'Untitled Article',
                image: image,
                content: summary || event.content.slice(0, 200) + '...',
                createdAt: event.created_at,
              };
            }

            if (item) {
              // Deduplicate profiles by pubkey, others by event ID
              const key = item.type === 'profile' ? item.pubkey : item.id;
              foundItems.set(key, item);
            }
          } catch {
            // ignore malformed
          }
        });

        // timeout to update UI
        setTimeout(() => {
          sub.stop();
          const sorted = Array.from(foundItems.values()).sort((a, b) => {
            // Prioritize profiles slightly? Or just by relevance?
            // NDK doesn't give relevance score.
            // Let's sort profiles first, then newness?
            if (a.type === 'profile' && b.type !== 'profile') return -1;
            if (b.type === 'profile' && a.type !== 'profile') return 1;
            return (b.createdAt || 0) - (a.createdAt || 0);
          });
          setResults(sorted);
          setLoading(false);
        }, 2500);
      } catch (err) {
        console.error('Search failed', err);
        setLoading(false);
      }
    };

    performSearch();
  }, [query, ndk]);

  return (
    <div className="search-page-wrapper">
      <div style={{ maxWidth: '992px', margin: '0 auto', width: '100%' }}>
        <Navbar />
      </div>
      <div
        className="search-page-container"
        style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}
      >
        <h2 className="section-header">Search Results for "{query}"</h2>

        {loading && (
          <div style={{ padding: '20px', textAlign: 'center' }}>Searching the cosmos...</div>
        )}

        {!loading && results.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            No results found. Try a different term.
          </div>
        )}

        <div
          className="search-results-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px',
            marginTop: '20px',
          }}
        >
          {results.map((item) => (
            <div
              key={item.id}
              className={`result-card result-${item.type}`}
              style={{
                border: '1px solid #ccc',
                background: '#fff',
                padding: '15px',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}
              >
                <span
                  style={{
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    background:
                      item.type === 'profile' ? '#eef' : item.type === 'note' ? '#efe' : '#fef',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    color: '#555',
                  }}
                >
                  {item.type}
                </span>
                <span style={{ fontSize: '12px', color: '#888' }}>
                  {item.createdAt ? new Date(item.createdAt * 1000).toLocaleDateString() : ''}
                </span>
              </div>

              {/* Profile View */}
              {item.type === 'profile' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: '1px solid #eee',
                    }}
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: '#ddd' }}></div>
                    )}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <Link
                      to={`/p/${item.pubkey}`}
                      style={{
                        fontWeight: 'bold',
                        textDecoration: 'none',
                        color: '#003399',
                        display: 'block',
                      }}
                    >
                      {item.title || item.pubkey.slice(0, 8)}
                    </Link>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#555',
                        marginTop: '4px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.content}
                    </div>
                  </div>
                </div>
              )}

              {/* Note View */}
              {item.type === 'note' && (
                <div>
                  <div
                    style={{
                      fontSize: '14px',
                      color: '#333',
                      marginBottom: '8px',
                      lineHeight: '1.4',
                    }}
                  >
                    {item.content.length > 200 ? item.content.slice(0, 200) + '...' : item.content}
                  </div>
                  <Link
                    to={`/p/${item.pubkey}`}
                    style={{ fontSize: '12px', color: '#003399', textDecoration: 'none' }}
                  >
                    By: {item.pubkey.slice(0, 8)}...
                  </Link>
                </div>
              )}

              {/* Article View */}
              {item.type === 'article' && (
                <div>
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.title}
                      style={{
                        width: '100%',
                        height: '120px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        marginBottom: '8px',
                      }}
                    />
                  )}
                  <h3 style={{ fontSize: '16px', margin: '0 0 5px 0' }}>{item.title}</h3>
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#666',
                      marginBottom: '8px',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {item.content}
                  </div>
                  <Link
                    to={`/p/${item.pubkey}`}
                    style={{ fontSize: '12px', color: '#003399', textDecoration: 'none' }}
                  >
                    By: {item.pubkey.slice(0, 8)}...
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

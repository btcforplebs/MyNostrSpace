import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { isBlockedUser, hasBlockedKeyword } from '../../utils/blockedUsers';
import { Navbar } from '../Shared/Navbar';
import { APP_RELAYS } from '../../utils/relay';
import './SearchPage.css';

interface SearchResult {
  id: string;
  pubkey: string;
  type: 'profile' | 'note';
  content: string;
  title?: string;
  image?: string;
  createdAt?: number;
}

export const SearchPage = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const { ndk } = useNostr();
  const [profileResults, setProfileResults] = useState<SearchResult[]>([]);
  const [postResults, setPostResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || !ndk) return;

    const performSearch = async () => {
      setLoading(true);
      setProfileResults([]);
      setPostResults([]);

      try {

        const searchRelaySet = NDKRelaySet.fromRelayUrls(APP_RELAYS.SEARCH, ndk);

        // Fetch profiles (kind 0) from search relays with higher limit
        // Fetch profiles (kind 0) from search relays using NIP-50
        const profileEvents = await ndk.fetchEvents(
          { kinds: [0], search: query, limit: 50 },
          { relaySet: searchRelaySet }
        );
        const foundProfiles = new Map<string, SearchResult>();

        Array.from(profileEvents).forEach((event: NDKEvent) => {
          if (isBlockedUser(event.pubkey)) return;
          try {
            const profile = JSON.parse(event.content);
            // We still filter client-side just in case some relays ignore NIP-50 and return random stuff
            // Trust NIP-50 results from the relay, simplified parsing
            const name = profile.name || '';
            const displayName = profile.display_name || '';

            // Deduplicate by pubkey (keep latest)
            const existing = foundProfiles.get(event.pubkey);
            if (!existing || (event.created_at || 0) > (existing.createdAt || 0)) {
              foundProfiles.set(event.pubkey, {
                id: event.pubkey,
                pubkey: event.pubkey,
                type: 'profile',
                title: displayName || name,
                image: profile.picture,
                content: profile.about || '',
                createdAt: event.created_at,
              });
            }
          } catch {
            // ignore malformed
          }
        });

        // Fetch posts (kind 1) from search relays using NIP-50
        const noteEvents = await ndk.fetchEvents(
          { kinds: [1], search: query, limit: 100 },
          { relaySet: searchRelaySet }
        );
        const foundPosts = new Map<string, SearchResult>();

        Array.from(noteEvents).forEach((event: NDKEvent) => {
          // Filter out replies (events with 'e' tag)
          if (event.tags.some((tag) => tag[0] === 'e')) return;
          if (isBlockedUser(event.pubkey)) return;
          if (hasBlockedKeyword(event.content)) return;

          foundPosts.set(event.id, {
            id: event.id,
            pubkey: event.pubkey,
            type: 'note',
            content: event.content,
            createdAt: event.created_at,
          });
        });

        // Sort and set results
        const sortedProfiles = Array.from(foundProfiles.values()).sort(
          (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
        );

        const sortedPosts = Array.from(foundPosts.values()).sort(
          (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
        );

        setProfileResults(sortedProfiles);
        setPostResults(sortedPosts);
        setLoading(false);
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
      <div className="search-page-container">
        <h2 className="section-header">Search Results for "{query}"</h2>

        {loading && (
          <div className="search-loading">Searching the cosmos...</div>
        )}

        {!loading && profileResults.length === 0 && postResults.length === 0 && (
          <div className="search-no-results">
            No results found. Try a different term.
          </div>
        )}

        {/* People Section */}
        {!loading && (
          <div className="search-section">
            <div className="search-section-header">
              👤 People ({profileResults.length})
            </div>
            <div className="search-section-body">
              {profileResults.length === 0 ? (
                <div className="search-section-empty">No profiles found</div>
              ) : (
                <div className="search-results-grid">
                  {profileResults.map((profile) => (
                    <div key={profile.id} className="profile-search-card">
                      <div className="profile-search-avatar">
                        {profile.image ? (
                          <img
                            src={profile.image}
                            alt={profile.title}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="profile-search-avatar-fallback"></div>
                        )}
                      </div>
                      <Link
                        to={`/p/${profile.pubkey}`}
                        className="profile-search-name"
                      >
                        {profile.title || profile.pubkey.slice(0, 8)}
                      </Link>
                      {profile.content && (
                        <div className="profile-search-bio">{profile.content}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Posts Section */}
        {!loading && (
          <div className="search-section">
            <div className="search-section-header">
              📝 Posts ({postResults.length})
            </div>
            <div className="search-section-body">
              {postResults.length === 0 ? (
                <div className="search-section-empty">No posts found</div>
              ) : (
                <div className="search-results-list">
                  {postResults.map((post, index) => (
                    <div
                      key={post.id}
                      className={`post-search-card ${index % 2 === 0 ? 'even' : 'odd'}`}
                    >
                      <div className="post-search-header">
                        <Link to={`/p/${post.pubkey}`} className="post-search-author">
                          {post.pubkey.slice(0, 8)}...
                        </Link>
                        <span className="post-search-date">
                          {post.createdAt
                            ? new Date(post.createdAt * 1000).toLocaleDateString()
                            : ''}
                        </span>
                      </div>
                      <div className="post-search-content">
                        {post.content.length > 300
                          ? post.content.slice(0, 300) + '...'
                          : post.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

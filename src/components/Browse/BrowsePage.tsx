import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import { isBlockedUser, hasBlockedKeyword } from '../../utils/blockedUsers';
import '../Landing/LandingPage.css'; // Reuse Landing Page CSS directly
import './BrowsePage.css'; // Additional overrides if needed

interface BrowseProfile {
  pubkey: string;
  name?: string;
  picture?: string;
}

interface ExternalLink {
  name: string;
  url: string;
}

const POPULAR_SITES: ExternalLink[] = [
  { name: 'Damus', url: 'https://damus.io' },
  { name: 'Amethyst', url: 'https://github.com/vitorpamplona/amethyst' },
  { name: 'Snort', url: 'https://snort.social' },
  { name: 'Primal', url: 'https://primal.net' },
  { name: 'Nostr.band', url: 'https://nostr.band' },
  { name: 'Nostr.watch', url: 'https://nostr.watch' },
];

const CATEGORIES = [
  { name: 'Videos', link: '/videos', icon: '📺' },
  { name: 'Rooms', link: '/rooms', icon: '🎙️' },
  { name: 'Games', link: '/games', icon: '🎮' },
  { name: 'Music', link: '/music', icon: '🎵' },
  { name: 'Marketplace', link: '/marketplace', icon: '🛍️' },
  { name: 'Livestreams', link: '/livestreams', icon: '🔴' },
  { name: 'Blogs', link: '/blogs', icon: '📝' },
  { name: 'Recipes', link: '/recipes', icon: '🍳' },
  { name: 'Photos', link: '/photos', icon: '📸' },
  { name: 'Badges', link: '/badges', icon: '🏅' },
  { name: 'Search', link: '/search', icon: '🔍' },
  { name: 'Calendar', link: '/calendar', icon: '📅' },
  { name: 'Film', link: '/film', icon: '📽️' },
];

const NoteMedia = ({ content }: { content: string }) => {
  // Simple regex to find the first URL
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const match = content.match(urlRegex);

  if (!match) return null;

  const url = match[0];
  const extension = url.split('.').pop()?.toLowerCase();

  // Image
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) {
    return (
      <div style={{ marginTop: '10px', textAlign: 'center' }}>
        <img
          src={url}
          alt="Note Attachment"
          style={{
            maxWidth: '100%',
            maxHeight: '300px',
            objectFit: 'contain',
            border: '1px solid #ccc',
          }}
        />
      </div>
    );
  }

  // Video
  if (['mp4', 'mov', 'webm'].includes(extension || '')) {
    return (
      <div style={{ marginTop: '10px', textAlign: 'center' }}>
        <video
          src={url}
          controls
          preload="metadata"
          style={{ maxWidth: '100%', maxHeight: '300px' }}
        />
      </div>
    );
  }

  // YouTube
  if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
    let videoId = null;
    if (url.includes('v=')) {
      videoId = url.split('v=')[1]?.split('&')[0];
    } else if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0];
    }

    if (videoId) {
      return (
        <div style={{ marginTop: '10px', textAlign: 'center' }}>
          <iframe
            width="100%"
            height="200"
            src={`https://www.youtube.com/embed/${videoId}`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Embedded Video"
          ></iframe>
        </div>
      );
    }
  }

  return null;
};

export const BrowsePage = () => {
  const { ndk } = useNostr();
  const [profiles, setProfiles] = useState<BrowseProfile[]>([]);
  const [recentNotes, setRecentNotes] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ndk) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch Profiles (Kind 0)
        const profileEvents = await ndk.fetchEvents({ kinds: [0], limit: 50 });
        const uniquePubkeys = new Set();
        const processedProfiles: BrowseProfile[] = [];
        const sortedProfiles = Array.from(profileEvents).sort(
          (a, b) => (b.created_at || 0) - (a.created_at || 0)
        );

        for (const event of sortedProfiles) {
          if (uniquePubkeys.has(event.pubkey) || isBlockedUser(event.pubkey)) continue;
          uniquePubkeys.add(event.pubkey);
          try {
            const content = JSON.parse(event.content);
            if (!content.name && !content.picture && !content.display_name) continue;
            if (
              hasBlockedKeyword(content.about || '') ||
              hasBlockedKeyword(content.name || '') ||
              hasBlockedKeyword(content.display_name || '')
            )
              continue;
            processedProfiles.push({
              pubkey: event.pubkey,
              name: content.name || content.display_name,
              picture: content.picture,
            });
          } catch {
            /* ignore */
          }
          if (processedProfiles.length >= 8) break; // Limit to 8 for 4x2 grid
        }
        setProfiles(processedProfiles);

        // 2. Fetch "Popular" Notes (Kind 1, filtered for top-level)
        const noteFilter: NDKFilter = { kinds: [1], limit: 100 };
        const noteEvents = await ndk.fetchEvents(noteFilter);

        const notesArray = Array.from(noteEvents)
          .filter(
            (event) =>
              !event.tags.some((tag) => tag[0] === 'e') &&
              !isBlockedUser(event.pubkey) &&
              !hasBlockedKeyword(event.content)
          )
          .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
          .slice(0, 20);

        await Promise.all(notesArray.map((n) => n.author.fetchProfile()));

        setRecentNotes(notesArray);
      } catch (err) {
        console.error('Browse fetch failed', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [ndk]);

  return (
    <div className="landing-container">
      <div className="landing-nav-wrapper">
        <Navbar />
      </div>

      <div className="landing-body">
        {/* Sidebar (Left Column) */}
        <div className="landing-sidebar">
          {/* Categories */}
          <div className="content-box">
            <div className="content-box-header">Browse Categories</div>
            <div className="galaxy-grid">
              {CATEGORIES.map((cat) => (
                <Link key={cat.name} to={cat.link} className="galaxy-item">
                  <span style={{ fontSize: '24px' }}>{cat.icon}</span>
                  <span>{cat.name}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Popular Sites */}
          <div className="content-box">
            <div className="content-box-header">Popular Sites</div>
            <div className="galaxy-grid" style={{ gridTemplateColumns: '1fr' }}>
              {POPULAR_SITES.map((site) => (
                <a
                  key={site.url}
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="galaxy-item"
                  style={{ flexDirection: 'row', justifyContent: 'center' }}
                >
                  <span>{site.name}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content (Right Column) */}
        <div className="landing-main">
          {/* People to Friend */}
          <div className="content-box">
            <div className="content-box-header">People to Friend</div>
            <div className="people-grid">
              {profiles.length > 0
                ? profiles.map((profile) => (
                    <div key={profile.pubkey} className="person-item">
                      <Link to={`/p/${profile.pubkey}`} className="person-link">
                        <div className="person-name">{profile.name || 'User'}</div>
                        <div className="person-pic">
                          <img
                            src={
                              profile.picture || `https://robohash.org/${profile.pubkey}?set=set4`
                            }
                            alt=""
                          />
                        </div>
                      </Link>
                    </div>
                  ))
                : [...Array(8)].map((_, i) => (
                    <div key={i} className="person-item">
                      <div className="skeleton skeleton-name"></div>
                      <div className="person-pic">
                        <div className="skeleton skeleton-pic"></div>
                      </div>
                    </div>
                  ))}
            </div>
          </div>

          {/* Global Feed */}
          <div className="content-box">
            <div className="content-box-header">Global Feed</div>
            <div className="global-feed-list" style={{ maxHeight: '600px' }}>
              {recentNotes.map((note) => (
                <div
                  key={note.id}
                  className="feed-item"
                  style={{ flexDirection: 'column', gap: '5px' }}
                >
                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                    <span className="feed-time">
                      {new Date((note.created_at || 0) * 1000).toLocaleDateString()}
                    </span>
                    <Link to={`/p/${note.pubkey}`} className="feed-author">
                      {note.author.profile?.name || note.pubkey.slice(0, 8)}
                    </Link>
                  </div>
                  <div className="feed-content">
                    {note.content.length > 280 ? note.content.slice(0, 280) + '...' : note.content}
                    <NoteMedia content={note.content} />
                  </div>
                </div>
              ))}
              {!loading && recentNotes.length === 0 && (
                <div style={{ padding: '10px' }}>No notes found.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

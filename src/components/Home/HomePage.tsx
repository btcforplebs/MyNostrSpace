import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { Navbar } from '../Shared/Navbar';
import { FeedItem } from '../Shared/FeedItem';
import { SEO } from '../Shared/SEO';
import { MediaUpload } from './MediaUpload';
import { BlogEditor } from './BlogEditor';
import { WavlakePlayer } from '../Music/WavlakePlayer';
import './HomePage.css';

interface MusicTrack {
  title: string;
  url: string;
  link: string;
  artist?: string;
}

interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  created_at: number;
  originalEvent: NDKEvent;
  thumb?: string;
}

const HomePage = () => {
  const { ndk, user } = useNostr();
  const navigate = useNavigate();
  const { layoutCss } = useCustomLayout(user?.pubkey);
  const [feed, setFeed] = useState<NDKEvent[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [musicLoading, setMusicLoading] = useState(false);
  // Deprecated single loading state, using fine-grained instead
  const [status, setStatus] = useState('');
  const [mood, setMood] = useState('None');
  const [notifications, setNotifications] = useState<NDKEvent[]>([]);
  const [parentEvents] = useState<Record<string, NDKEvent>>({});
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [stats, setStats] = useState({
    followers: 0,
    zaps: 0,
    posts: 0,
  });
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediaModalType, setMediaModalType] = useState<'photo' | 'video'>('photo');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  // Keep legacy state for now to avoid breaking too much, but we'll use mediaItems mostly
  // mediaEvents removed as we used mediaItems now
  const [blogEvents, setBlogEvents] = useState<NDKEvent[]>([]);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [streamEvents, setStreamEvents] = useState<NDKEvent[]>([]);
  const [viewMode, setViewMode] = useState<
    'feed' | 'media' | 'blog' | 'music' | 'streams' | 'calendar' | 'reviews'
  >('feed');
  const [isBlogModalOpen, setIsBlogModalOpen] = useState(false);

  // Infinite Scroll State
  const [feedUntil, setFeedUntil] = useState<number | null>(null);
  const [hasMoreFeed, setHasMoreFeed] = useState(true);

  const MOODS = [
    'None',
    'Happy',
    'Sad',
    'Angry',
    'Confused',
    'Excited',
    'Sleepy',
    'Bored',
    'Hyper',
    'Creative',
  ];

  // Helper for safe follows
  const getFollows = useCallback(async () => {
    if (!ndk || !user) return [];
    const activeUser = ndk.getUser({ pubkey: user.pubkey });
    // Timeout helper
    const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
      ]);
    };

    const followedUsersSet = await withTimeout(
      activeUser.follows().catch(() => new Set<import('@nostr-dev-kit/ndk').NDKUser>()),
      3000,
      new Set<import('@nostr-dev-kit/ndk').NDKUser>()
    );
    const followPubkeys = Array.from(followedUsersSet || new Set()).map(u => u.pubkey);
    if (!followPubkeys.includes(user.pubkey)) followPubkeys.push(user.pubkey);
    return followPubkeys;
  }, [ndk, user]);

  // Pagination Handler (Load More)
  const loadMoreFeed = useCallback(async () => {
    if (!feedUntil || !ndk) return;
    // Fetch older items (blocking fetch is fine for pagination)
    const authors = await getFollows();
    const filter: NDKFilter = {
      kinds: [1],
      authors: authors,
      limit: 20,
      until: feedUntil
    };
    const events = await ndk.fetchEvents(filter);
    const newEvents = Array.from(events).filter(e => !e.tags.some(t => t[0] === 'e'));
    if (newEvents.length === 0) {
      setHasMoreFeed(false);
      return;
    }

    setFeed(prev => {
      const combined = [...prev, ...newEvents];
      // Dedup
      const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
      return unique.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    });

    // Update cursor
    const oldest = newEvents.sort((a, b) => (a.created_at || 0) - (b.created_at || 0))[0];
    if (oldest?.created_at) setFeedUntil(oldest.created_at - 1);
  }, [feedUntil, ndk, getFollows]);



  // Infinite Scroll Handler
  useEffect(() => {
    const handleScroll = () => {
      // Allow scroll if we have more feed AND a cursor (meaning we've finished at least one load)
      if (viewMode !== 'feed' || !feedUntil || !hasMoreFeed) return;

      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        loadMoreFeed();
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [viewMode, feedUntil, loadMoreFeed]);

  // Separate function for heavy media fetching


  // Initial Subscription (Streaming)
  useEffect(() => {
    if (!ndk || !user || viewMode !== 'feed') return;

    let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;

    // Only set loading if feed is empty to avoid flickering on re-nav
    if (feed.length === 0) setFeedLoading(true);

    const startSub = async () => {
      const authors = await getFollows();
      const filter: NDKFilter = {
        kinds: [1],
        authors: authors,
        limit: 20
      };

      sub = ndk.subscribe(filter, { closeOnEose: false });

      sub.on('event', (apiEvent: NDKEvent) => {
        // Filter out replies (events with 'e' tags)
        if (apiEvent.tags.some(t => t[0] === 'e')) return;

        // Fetch profile lazily
        apiEvent.author.fetchProfile();

        // Update state
        setFeed(prev => {
          if (prev.find(e => e.id === apiEvent.id)) return prev;
          const next = [...prev, apiEvent];
          return next.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        });

        // If first event, maybe stop loading? Or wait for EOSE.
      });

      sub.on('eose', () => {
        setFeedLoading(false);
        // Set initial cursor for pagination
        setFeed(prev => {
          if (prev.length > 0) {
            const oldest = prev[prev.length - 1];
            if (oldest.created_at) setFeedUntil(oldest.created_at - 1);
          }
          return prev;
        });
      });
    };

    startSub();

    return () => {
      if (sub) sub.stop();
    };
  }, [ndk, user, viewMode, getFollows]); // Remove feed dependency to avoid loop, but we check feed.length inside

  // Media Subscription
  useEffect(() => {
    if (!ndk || !user || viewMode !== 'media') return;

    let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;
    if (mediaItems.length === 0) setMediaLoading(true);

    const startMediaSub = async () => {
      const authors = await getFollows();
      const filter: NDKFilter = {
        kinds: [1, 1063],
        authors: authors,
        limit: 50
      };

      sub = ndk.subscribe(filter, { closeOnEose: false });

      sub.on('event', (ev: NDKEvent) => {
        const newItem: MediaItem | null = (() => {
          if (ev.kind === 1063) {
            const url = ev.tags.find(t => t[0] === 'url')?.[1];
            const mime = ev.tags.find(t => t[0] === 'm')?.[1] || '';
            const thumb = ev.tags.find(t => t[0] === 'thumb' || t[0] === 'image')?.[1];
            if (url) {
              return {
                id: ev.id,
                url,
                type: mime.startsWith('video') ? 'video' : 'image',
                created_at: ev.created_at || 0,
                originalEvent: ev,
                thumb
              };
            }
          } else if (ev.kind === 1) {
            const imgRegex = /(https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp))/i;
            const videoRegex = /(https?:\/\/\S+\.(?:mp4|mov|webm))/i;
            const imgMatch = ev.content.match(imgRegex);
            if (imgMatch) {
              return {
                id: ev.id + '-img',
                url: imgMatch[0],
                type: 'image',
                created_at: ev.created_at || 0,
                originalEvent: ev
              };
            }
            const vidMatch = ev.content.match(videoRegex);
            if (vidMatch) {
              return {
                id: ev.id + '-vid',
                url: vidMatch[0],
                type: 'video',
                created_at: ev.created_at || 0,
                originalEvent: ev
              };
            }
          }
          return null;
        })();

        if (newItem) {
          setMediaItems(prev => {
            if (prev.find(i => i.id === newItem.id)) return prev;
            const next = [...prev, newItem];
            return next.sort((a, b) => b.created_at - a.created_at);
          });
        }
      });

      sub.on('eose', () => setMediaLoading(false));
    };

    startMediaSub();
    return () => { if (sub) sub.stop(); };
  }, [ndk, user, viewMode, getFollows]);

  // Blog Subscription
  useEffect(() => {
    if (!ndk || !user || viewMode !== 'blog') return;
    let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;

    const start = async () => {
      const authors = await getFollows();
      sub = ndk.subscribe({ kinds: [30023], authors, limit: 20 }, { closeOnEose: false });
      sub.on('event', (ev) => {
        setBlogEvents(prev => {
          if (prev.find(e => e.id === ev.id)) return prev;
          return [...prev, ev].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        });
      });
    };
    start();
    return () => { if (sub) sub.stop(); };
  }, [ndk, user, viewMode, getFollows]);

  // Stream Subscription
  useEffect(() => {
    if (!ndk || !user || viewMode !== 'streams') return;
    let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;

    const start = async () => {
      const authors = await getFollows();
      // @ts-ignore
      sub = ndk.subscribe({ kinds: [30311], authors, limit: 20 }, { closeOnEose: false });
      sub.on('event', (ev) => {
        setStreamEvents(prev => {
          if (prev.find(e => e.id === ev.id)) return prev;
          // Live sort logic
          const sorted = [...prev, ev].sort((a, b) => {
            const aStatus = a.tags.find(t => t[0] === 'status')?.[1] || 'ended';
            const bStatus = b.tags.find(t => t[0] === 'status')?.[1] || 'ended';
            if (aStatus === 'live' && bStatus !== 'live') return -1;
            if (bStatus === 'live' && aStatus !== 'live') return 1;
            return (b.created_at || 0) - (a.created_at || 0);
          });
          return sorted;
        });
      });
    };
    start();
    return () => { if (sub) sub.stop(); };
  }, [ndk, user, viewMode, getFollows]);

  // Music Subscription
  useEffect(() => {
    if (!ndk || !user || viewMode !== 'music') return;
    setMusicLoading(true);
    let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;

    const start = async () => {
      const authors = await getFollows();
      sub = ndk.subscribe({ kinds: [1], authors, limit: 50 }, { closeOnEose: false });

      sub.on('event', (ev) => {
        const match = ev.content.match(/https?:\/\/(?:www\.)?wavlake\.com\/(?:track|embed)\/([a-zA-Z0-9-]+)/);
        if (match) {
          const url = match[0];
          const track: MusicTrack = {
            title: ev.content.replace(url, '').trim().split('\n')[0].substring(0, 50) || 'Untitled',
            url,
            link: url,
            artist: ev.author.profile?.name || 'Unknown'
          };

          setMusicTracks(prev => {
            if (prev.find(t => t.url === url)) return prev;
            return [...prev, track];
          });
        }
      });

      sub.on('eose', () => setMusicLoading(false));
    };
    start();
    return () => { if (sub) sub.stop(); };
  }, [ndk, user, viewMode, getFollows]);

  // Aux Data Fetcher
  const fetchAuxData = useCallback(async () => {
    if (!ndk || !user) return;
    try {
      const notificationFilter: NDKFilter = { '#p': [user.pubkey], kinds: [1, 7, 9735], limit: 30 };
      const notificationEvents = await ndk.fetchEvents(notificationFilter);
      const sortedNotifications = Array.from(notificationEvents).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      await Promise.allSettled(sortedNotifications.map(async (e) => { try { await e.author.fetchProfile(); } catch { } }));
      setNotifications(sortedNotifications.filter(n => n.pubkey !== user.pubkey));

      // Stats
      const statsPromises = [];
      statsPromises.push(ndk.fetchEvents({ kinds: [3], '#p': [user.pubkey] }).then(s => s.size));
      statsPromises.push(ndk.fetchEvents({ kinds: [9735], '#p': [user.pubkey] }).then(s => s.size));
      statsPromises.push(ndk.fetchEvents({ kinds: [1], authors: [user.pubkey] }).then(s => s.size));
      const [followers, zaps, posts] = await Promise.all(statsPromises);
      setStats({ followers, zaps, posts });
    } catch (e) {
      console.error("Aux data fetch error", e);
    }
  }, [ndk, user]);

  useEffect(() => {
    fetchAuxData();
  }, [fetchAuxData]);

  const handlePostStatus = async () => {
    if (!ndk || !status.trim()) return;
    try {
      const event = new NDKEvent(ndk);
      event.kind = 1;
      // Only include mood if it's not "None"
      if (mood !== 'None') {
        event.content = `Mood: ${mood}\n\n${status}`;
      } else {
        event.content = status;
      }
      await event.publish();
      setStatus('');
      fetchAuxData(); // Refresh aux data (feed auto-updates via sub)
    } catch (error) {
      console.error('Error posting status:', error);
    }
  };

  if (!user) return null;

  return (
    <div className="home-page-container">
      {layoutCss && <style>{layoutCss}</style>}
      <SEO
        title="Home"
        description="Welcome to MyNostrSpace. Connect with friends on the Nostr network."
      />
      <Navbar />
      <div className="home-content">
        <div className="home-header-top">
          <h1>Hello, {user.profile?.name || user.profile?.display_name || 'User'}!</h1>
          <Link to="/edit-layout" className="page-themes-link">
            <span className="theme-icon"></span>
            Page Themes (18)
          </Link>
        </div>
        <div className="home-header-sub">
          <div className="my-url-text">
            My URL: <Link to={`/p/${user.pubkey}`}>mynostrspace.com/{user.pubkey.slice(0, 8)}</Link>{' '}
            [ <Link to="/edit-profile">Edit Profile</Link> ]
          </div>
          <div>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
            })}
          </div>
        </div>

        <div className="home-layout">
          {/* Left Sidebar */}
          <div className="home-column-left">
            <div className="home-box user-pic-box">
              <img
                src={user.profile?.picture || 'https://via.placeholder.com/170'}
                alt="Profile"
                className="user-pic"
              />
              <ul className="profile-stats">
                <li>
                  <strong>Followers:</strong> {stats.followers.toLocaleString()}
                </li>
                <li>
                  <strong>Zaps:</strong> {stats.zaps.toLocaleString()}
                </li>
                <li>
                  <strong>Posts:</strong> {stats.posts.toLocaleString()}
                </li>
                <li>
                  <strong>Last Login:</strong> {new Date().toLocaleDateString()}
                </li>
              </ul>
            </div>

            <div className="home-box">
              <ul className="quick-links" style={{ padding: '5px' }}>
                <li>
                  <strong>Photos:</strong>{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setViewMode('media');
                    }}
                  >
                    Edit
                  </a>{' '}
                  |{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setMediaModalType('photo');
                      setIsMediaModalOpen(true);
                    }}
                  >
                    Upload
                  </a>
                </li>
                <li>
                  <strong>Videos:</strong>{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setViewMode('media');
                    }}
                  >
                    Edit
                  </a>{' '}
                  |{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setMediaModalType('video');
                      setIsMediaModalOpen(true);
                    }}
                  >
                    Upload
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setViewMode('calendar');
                    }}
                  >
                    Manage Calendar
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setViewMode('blog');
                    }}
                  >
                    Manage Blog
                  </a>{' '}
                  [{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsBlogModalOpen(true);
                    }}
                  >
                    New
                  </a>{' '}
                  ]
                </li>
                <li>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setViewMode('reviews');
                    }}
                  >
                    Manage Reviews
                  </a>
                </li>
              </ul>
            </div>

            <div className="home-box" style={{ background: '#f5f5f5' }}>
              <div className="home-box-header" style={{ background: '#f04e30' }}>
                Alerts
              </div>
              <div className="home-box-body">
                {notifications.length > 0 ? (
                  <>
                    <ul className="notifications-list">
                      {(showAllNotifications ? notifications : notifications.slice(0, 5)).map(
                        (n: NDKEvent) => {
                          const isLike = n.kind === 7;
                          const isZap = n.kind === 9735;
                          const isComment = n.kind === 1;
                          let actionText = 'interacted with you';
                          if (isLike) actionText = 'liked your post';
                          if (isZap) actionText = 'zapped you';
                          if (isComment) actionText = 'replied to you';

                          return (
                            <li key={n.id} className="notification-item">
                              <img
                                src={n.author.profile?.picture || 'https://via.placeholder.com/20'}
                                className="notification-user-pic"
                                alt=""
                              />
                              <div className="notification-content">
                                <Link to={`/p/${n.pubkey}`} className="notification-user-name">
                                  {n.author.profile?.name || n.pubkey.slice(0, 8)}
                                </Link>
                                <span className="notification-action">
                                  {' '}
                                  <Link
                                    to={`/thread/${n.id}`}
                                    style={{ color: '#333', textDecoration: 'none' }}
                                  >
                                    {actionText}
                                  </Link>
                                </span>

                                {isComment && (
                                  <div className="notification-parent-snippet">
                                    {(() => {
                                      const parentId = n.tags.find(
                                        (t: string[]) => t[0] === 'e' && (t[3] === 'reply' || !t[3])
                                      )?.[1];
                                      const parent = parentId ? parentEvents[parentId] : null;
                                      if (parent) {
                                        const content = parent.content.replace(
                                          /^Mood: (.*?)\n\n/,
                                          ''
                                        );
                                        return `re: "${content.slice(0, 40)}${content.length > 40 ? '...' : ''}"`;
                                      }
                                      return null;
                                    })()}
                                  </div>
                                )}

                                <div className="notification-time">
                                  {n.created_at
                                    ? new Date(n.created_at * 1000).toLocaleDateString([], {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                    : ''}
                                </div>
                              </div>
                            </li>
                          );
                        }
                      )}
                    </ul>
                    {!showAllNotifications && notifications.length > 5 && (
                      <div style={{ textAlign: 'right', marginTop: '5px' }}>
                        <span
                          style={{
                            color: '#003399',
                            fontSize: '8pt',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                          }}
                          onClick={() => setShowAllNotifications(true)}
                        >
                          show more
                        </span>
                      </div>
                    )}
                    {showAllNotifications && (
                      <div style={{ textAlign: 'right', marginTop: '5px' }}>
                        <span
                          style={{
                            color: '#003399',
                            fontSize: '8pt',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                          }}
                          onClick={() => setShowAllNotifications(false)}
                        >
                          show less
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: '#666', fontSize: '8pt', padding: '5px' }}>
                    No new alerts.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Middle Column */}
          <div className="home-column-middle">
            <div className="home-box status-mood-box">
              <div className="status-mood-header">Status and Mood</div>
              <div className="status-input-container">
                <textarea
                  className="status-input"
                  placeholder="What are you doing right now?"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                />
                <div className="status-controls">
                  <div className="mood-selector">
                    Mood:
                    <select value={mood} onChange={(e) => setMood(e.target.value)}>
                      {MOODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="post-status-btn" onClick={handlePostStatus}>
                    Post
                  </button>
                </div>
              </div>
              <div className="feed-container">
                <div className="view-mode-tabs">
                  <button
                    className={viewMode === 'feed' ? 'active' : ''}
                    onClick={() => setViewMode('feed')}
                  >
                    Feed
                  </button>
                  <button
                    className={viewMode === 'media' ? 'active' : ''}
                    onClick={() => setViewMode('media')}
                  >
                    Media
                  </button>
                  <button
                    className={viewMode === 'blog' ? 'active' : ''}
                    onClick={() => setViewMode('blog')}
                  >
                    Blog
                  </button>
                  <button
                    className={viewMode === 'music' ? 'active' : ''}
                    onClick={() => setViewMode('music')}
                  >
                    Music
                  </button>
                  <button
                    className={viewMode === 'streams' ? 'active' : ''}
                    onClick={() => setViewMode('streams')}
                  >
                    Streams
                  </button>
                </div>

                {feedLoading && viewMode === 'feed' && <div style={{ padding: '10px' }}>Loading Feed...</div>}

                {viewMode === 'feed' && (
                  <>
                    {feed.map((event: NDKEvent) => (
                      <FeedItem key={event.id} event={event} />
                    ))}
                    {!feedLoading && feed.length === 0 && (
                      <div style={{ padding: '10px' }}>No updates from friends yet.</div>
                    )}
                  </>
                )}

                {viewMode === 'media' && (
                  <div className="media-gallery">
                    {mediaItems.map((item) => (
                      <div key={item.id} className="gallery-item">
                        {item.type === 'image' ? (
                          <img
                            src={item.url}
                            alt=""
                            loading="lazy"
                            onClick={() => window.open(item.url, '_blank')}
                          />
                        ) : (
                          <video
                            src={item.url}
                            controls
                            preload="metadata"
                            poster={item.thumb}
                          />
                        )}
                      </div>
                    ))}
                    {mediaLoading && <div style={{ padding: '10px' }}>Loading Media...</div>}
                    {!mediaLoading && mediaItems.length === 0 && (
                      <div style={{ padding: '20px', textAlign: 'center' }}>No media found.</div>
                    )}
                  </div>
                )}

                {viewMode === 'blog' && (
                  <div className="blog-gallery">
                    {blogEvents.map((event: NDKEvent) => {
                      const dTag = event.tags.find(t => t[0] === 'd')?.[1];
                      const title = event.tags.find((t: string[]) => t[0] === 'title')?.[1] || 'Untitled';
                      const summary = event.tags.find((t: string[]) => t[0] === 'summary')?.[1];
                      const image = event.tags.find((t: string[]) => t[0] === 'image')?.[1];

                      return (
                        <div
                          key={event.id}
                          className="blog-entry-card"
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            if (dTag) navigate(`/blog/${event.pubkey}/${dTag}`);
                          }}
                        >
                          {image && (
                            <img
                              src={image}
                              alt={title}
                              className="blog-entry-image"
                            />
                          )}
                          <div className="blog-entry-content">
                            <h3 className="blog-entry-title">
                              {title}
                            </h3>
                            <p className="blog-entry-summary">
                              {summary}
                            </p>
                            <div className="blog-entry-meta">
                              {new Date((event.created_at || 0) * 1000).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {!feedLoading && blogEvents.length === 0 && (
                      <div style={{ padding: '20px', textAlign: 'center' }}>No blog posts yet.</div>
                    )}
                  </div>
                )}

                {viewMode === 'music' && (
                  <div className="music-tab-container" style={{ padding: '10px' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Friend's Mixtape</h3>
                    {musicLoading && <div style={{ padding: '10px' }}>Loading Mixtape...</div>}
                    {!musicLoading && musicTracks.length > 0 ? (
                      <WavlakePlayer
                        tracks={musicTracks}
                        autoplay={false}
                      />
                    ) : (
                      <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                        No music found in your circle yet. Post a Wavlake link to start the party!
                      </div>
                    )}
                  </div>
                )}

                {viewMode === 'streams' && (
                  <div className="streams-tab-container">
                    <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Live Streams</h3>
                    {mediaLoading && <div style={{ padding: '10px' }}>Scanning frequencies...</div>}
                    <div className="media-gallery">
                      {streamEvents.map((event) => {
                        const title = event.tags.find(t => t[0] === 'title')?.[1] || 'Untitled Stream';
                        const status = event.tags.find(t => t[0] === 'status')?.[1] || 'ended';
                        const image = event.tags.find(t => t[0] === 'image')?.[1] || 'https://via.placeholder.com/300x200?text=No+Preview';
                        const dTag = event.tags.find(t => t[0] === 'd')?.[1];

                        return (
                          <div key={event.id} className="gallery-item" style={{ position: 'relative', cursor: 'pointer' }}>
                            <div style={{
                              position: 'absolute',
                              top: 5,
                              left: 5,
                              background: status === 'live' ? 'red' : 'gray',
                              color: 'white',
                              padding: '2px 5px',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              borderRadius: '3px'
                            }}>
                              {status.toUpperCase()}
                            </div>
                            <img
                              src={image}
                              alt={title}
                              onClick={() => {
                                if (dTag) navigate(`/live/${event.pubkey}/${dTag}`);
                              }}
                            />
                            <div style={{ padding: '5px', fontSize: '10px', fontWeight: 'bold' }}>
                              {title}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {!mediaLoading && streamEvents.length === 0 && (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                        No streams found from people you follow.
                        <br />
                        <small>Make sure you are following active streamers!</small>
                      </div>
                    )}
                  </div>
                )}

                {viewMode === 'calendar' && (
                  <div style={{ padding: '20px', textAlign: 'center' }}>
                    Calendar functionality coming soon! (Kind 31922)
                  </div>
                )}

                {viewMode === 'reviews' && (
                  <div style={{ padding: '20px', textAlign: 'center' }}>
                    Reviews functionality coming soon! (Kind 1985)
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <MediaUpload
        isOpen={isMediaModalOpen}
        type={mediaModalType}
        onClose={() => setIsMediaModalOpen(false)}
        onUploadComplete={fetchAuxData}
      />
      <BlogEditor
        isOpen={isBlogModalOpen}
        onClose={() => setIsBlogModalOpen(false)}
        onPostComplete={fetchAuxData}
      />
    </div>
  );
};

export default HomePage;

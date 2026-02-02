import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { Navbar } from '../Shared/Navbar';
import { FeedItem } from '../Shared/FeedItem';
import { SEO } from '../Shared/SEO';
import { MediaUpload } from './MediaUpload';
import { BlogEditor } from './BlogEditor';
import './HomePage.css';

export const HomePage: React.FC = () => {
  const { user, ndk } = useNostr();
  const { layoutCss } = useCustomLayout(user?.pubkey);
  const [feed, setFeed] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [mood, setMood] = useState('None');
  const [notifications, setNotifications] = useState<NDKEvent[]>([]);
  const [parentEvents, setParentEvents] = useState<Record<string, NDKEvent>>({});
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [stats, setStats] = useState({
    followers: 0,
    zaps: 0,
    posts: 0,
  });
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediaModalType, setMediaModalType] = useState<'photo' | 'video'>('photo');
  const [mediaEvents, setMediaEvents] = useState<NDKEvent[]>([]);
  const [blogEvents, setBlogEvents] = useState<NDKEvent[]>([]);
  const [viewMode, setViewMode] = useState<
    'feed' | 'photos' | 'videos' | 'blog' | 'calendar' | 'reviews'
  >('feed');
  const [isBlogModalOpen, setIsBlogModalOpen] = useState(false);

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

  const fetchHomeData = useCallback(async () => {
    if (!ndk || !user) return;
    setLoading(true);

    try {
      // 1. Get followed users
      const activeUser = ndk.getUser({ pubkey: user.pubkey });
      const followedUsersSet = await activeUser.follows();
      const followedUsers = Array.from(followedUsersSet);

      // 2. Fetch feed from followed users
      const followPubkeys = followedUsers.map((u) => u.pubkey);
      if (followPubkeys.length > 0) {
        const filter: NDKFilter = {
          kinds: [1],
          authors: followPubkeys,
          limit: 20,
        };
        const events = await ndk.fetchEvents(filter);
        const sortedEvents = Array.from(events).sort(
          (a: NDKEvent, b: NDKEvent) => (b.created_at || 0) - (a.created_at || 0)
        );

        // Fetch profiles for the feed
        await Promise.all(sortedEvents.map((e) => e.author.fetchProfile()));
        setFeed(sortedEvents);
      }

      // 3. Fetch Notifications (kind 1 replies, kind 7 likes, kind 9735 zaps)
      const notificationFilter: NDKFilter = {
        '#p': [user.pubkey],
        kinds: [1, 7, 9735],
        limit: 30,
      };
      const notificationEvents = await ndk.fetchEvents(notificationFilter);
      const sortedNotifications = Array.from(notificationEvents).sort(
        (a: NDKEvent, b: NDKEvent) => (b.created_at || 0) - (a.created_at || 0)
      );

      // Fetch profiles for notifications
      await Promise.all(
        sortedNotifications.map(async (e) => {
          try {
            await e.author.fetchProfile();
          } catch (err) {
            console.warn(`Failed to fetch profile for ${e.pubkey}`, err);
          }
        })
      );

      // Filter out self-notifications
      const filteredNotifications = sortedNotifications.filter((n) => n.pubkey !== user.pubkey);
      setNotifications(filteredNotifications);

      // 4. Fetch Parent Events for Replies (Kind 1)
      const replyEvents = sortedNotifications.filter((n) => n.kind === 1);
      const parentIds = replyEvents
        .map((n) => n.tags.find((t) => t[0] === 'e' && (t[3] === 'reply' || !t[3]))?.[1])
        .filter(Boolean) as string[];

      if (parentIds.length > 0) {
        const parentsFilter: NDKFilter = {
          ids: parentIds,
        };
        const fetchedParents = await ndk.fetchEvents(parentsFilter);
        const parentMap: Record<string, NDKEvent> = {};
        fetchedParents.forEach((p) => {
          parentMap[p.id] = p;
        });
        setParentEvents((prev) => ({ ...prev, ...parentMap }));
      }

      // 5. Fetch Profile Stats
      const statsPromises = [];

      // Follower count (Kind 3 events tagging the user)
      const followerFilter: NDKFilter = {
        kinds: [3],
        '#p': [user.pubkey],
      };
      statsPromises.push(ndk.fetchEvents(followerFilter).then((evs: Set<NDKEvent>) => evs.size));

      // Zap count (Kind 9735)
      const zapFilter: NDKFilter = {
        kinds: [9735],
        '#p': [user.pubkey],
      };
      statsPromises.push(ndk.fetchEvents(zapFilter).then((evs: Set<NDKEvent>) => evs.size));

      // Post count (Kind 1)
      const postFilter: NDKFilter = {
        kinds: [1],
        authors: [user.pubkey],
      };
      statsPromises.push(ndk.fetchEvents(postFilter).then((evs: Set<NDKEvent>) => evs.size));

      const [followerCount, zapCount, postCount] = await Promise.all(statsPromises);
      setStats({
        followers: followerCount,
        zaps: zapCount,
        posts: postCount,
      });

      // 6. Fetch Media Events (Kind 1063)
      const mediaFilter: NDKFilter = {
        kinds: [1063],
        authors: [user.pubkey],
      };
      const fetchedMedia = await ndk.fetchEvents(mediaFilter);
      setMediaEvents(
        Array.from(fetchedMedia).sort(
          (a: NDKEvent, b: NDKEvent) => (b.created_at || 0) - (a.created_at || 0)
        )
      );

      // 7. Fetch Blog Events (Kind 30023)
      const blogFilter: NDKFilter = {
        kinds: [30023],
        authors: [user.pubkey],
      };
      const fetchedBlogs = await ndk.fetchEvents(blogFilter);
      setBlogEvents(
        Array.from(fetchedBlogs).sort(
          (a: NDKEvent, b: NDKEvent) => (b.created_at || 0) - (a.created_at || 0)
        )
      );
    } catch (error) {
      console.error('Error fetching home data:', error);
    } finally {
      setLoading(false);
    }
  }, [ndk, user]);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

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
      fetchHomeData(); // Refresh feed
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
                      setViewMode('photos');
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
                      setViewMode('videos');
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
                    Stream
                  </button>
                  <button
                    className={viewMode === 'photos' ? 'active' : ''}
                    onClick={() => setViewMode('photos')}
                  >
                    Photos
                  </button>
                  <button
                    className={viewMode === 'videos' ? 'active' : ''}
                    onClick={() => setViewMode('videos')}
                  >
                    Videos
                  </button>
                  <button
                    className={viewMode === 'blog' ? 'active' : ''}
                    onClick={() => setViewMode('blog')}
                  >
                    Blog
                  </button>
                </div>

                {loading && <div style={{ padding: '10px' }}>Loading...</div>}

                {viewMode === 'feed' && (
                  <>
                    {feed.map((event: NDKEvent) => (
                      <FeedItem key={event.id} event={event} />
                    ))}
                    {!loading && feed.length === 0 && (
                      <div style={{ padding: '10px' }}>No updates from friends yet.</div>
                    )}
                  </>
                )}

                {viewMode === 'photos' && (
                  <div className="media-gallery">
                    {mediaEvents
                      .filter((e: NDKEvent) =>
                        e.tags.find((t: string[]) => t[0] === 'm' && t[1].startsWith('image/'))
                      )
                      .map((event: NDKEvent) => (
                        <div key={event.id} className="gallery-item">
                          <img
                            src={event.tags.find((t: string[]) => t[0] === 'url')?.[1]}
                            alt={event.content}
                            onClick={() =>
                              window.open(
                                event.tags.find((t: string[]) => t[0] === 'url')?.[1] || '',
                                '_blank'
                              )
                            }
                          />
                        </div>
                      ))}
                    {!loading &&
                      mediaEvents.filter((e: NDKEvent) =>
                        e.tags.find((t: string[]) => t[0] === 'm' && t[1].startsWith('image/'))
                      ).length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center' }}>No photos yet.</div>
                      )}
                  </div>
                )}

                {viewMode === 'videos' && (
                  <div className="media-gallery">
                    {mediaEvents
                      .filter((e: NDKEvent) =>
                        e.tags.find((t: string[]) => t[0] === 'm' && t[1].startsWith('video/'))
                      )
                      .map((event: NDKEvent) => (
                        <div key={event.id} className="gallery-item">
                          <video
                            src={event.tags.find((t: string[]) => t[0] === 'url')?.[1]}
                            controls
                          />
                        </div>
                      ))}
                    {!loading &&
                      mediaEvents.filter((e: NDKEvent) =>
                        e.tags.find((t: string[]) => t[0] === 'm' && t[1].startsWith('video/'))
                      ).length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center' }}>No videos yet.</div>
                      )}
                  </div>
                )}

                {viewMode === 'blog' && (
                  <div className="blog-gallery">
                    {blogEvents.map((event: NDKEvent) => (
                      <div key={event.id} className="blog-entry-card">
                        {event.tags.find((t: string[]) => t[0] === 'image') && (
                          <img
                            src={event.tags.find((t: string[]) => t[0] === 'image')?.[1]}
                            alt=""
                            className="blog-entry-image"
                          />
                        )}
                        <div className="blog-entry-content">
                          <h3 className="blog-entry-title">
                            {event.tags.find((t: string[]) => t[0] === 'title')?.[1]}
                          </h3>
                          <p className="blog-entry-summary">
                            {event.tags.find((t: string[]) => t[0] === 'summary')?.[1]}
                          </p>
                          <div className="blog-entry-meta">
                            {new Date((event.created_at || 0) * 1000).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                    {!loading && blogEvents.length === 0 && (
                      <div style={{ padding: '20px', textAlign: 'center' }}>No blog posts yet.</div>
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
        onUploadComplete={fetchHomeData}
      />
      <BlogEditor
        isOpen={isBlogModalOpen}
        onClose={() => setIsBlogModalOpen(false)}
        onPostComplete={fetchHomeData}
      />
    </div>
  );
};

export default HomePage;

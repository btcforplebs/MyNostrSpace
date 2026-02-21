import { useEffect, useState, useMemo } from 'react';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { Navbar } from '../Shared/Navbar';
import { SEO } from '../Shared/SEO';
import { MediaUpload } from './MediaUpload';
import { BlogEditor } from './BlogEditor';
import { useNotifications } from '../../context/NotificationContext';
import { useBlockList } from '../../hooks/useBlockList';
import { MentionInput } from '../Shared/MentionInput';
import { extractMentions } from '../../utils/mentions';

import './HomePage.css';

// Hooks
import { useFollows } from '../../hooks/useFollows';
import { useProfileStats } from '../../hooks/useProfileStats';
import { useMediaSubscription } from '../../hooks/useMediaSubscription';
import { useFeedSubscription } from '../../hooks/useFeedSubscription';
import { useNotificationSubscription } from '../../hooks/useNotificationSubscription';
import { useLongFormSubscription } from '../../hooks/useLongFormSubscription';

// Components
import { HomeSidebar } from './HomeSidebar';
import { HomeFeedTabs } from './HomeFeedTabs';

const HomePage = () => {
  const { ndk, user } = useNostr();
  const { layoutCss } = useCustomLayout(user?.pubkey);

  const [status, setStatus] = useState('');
  const [mood, setMood] = useState('None');
  const [columnCount, setColumnCount] = useState(3);
  const { markAsRead, lastSeen } = useNotifications();
  const { allBlockedPubkeys } = useBlockList();

  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediaModalType, setMediaModalType] = useState<'photo' | 'video'>('photo');
  const [isBlogModalOpen, setIsBlogModalOpen] = useState(false);

  const [viewMode, setViewMode] = useState<
    'feed' | 'media' | 'blog' | 'streams' | 'notifications' | 'replies'
  >('feed');

  // Load Custom Hooks
  const { getFollows } = useFollows(ndk, user);
  const { stats, loadingStats, fetchStats } = useProfileStats(ndk, user, allBlockedPubkeys);

  const {
    mediaItems,
    mediaLoading,
    hasMoreMedia,
    isLoadingMoreMedia,
    loadMoreMedia,
    processMediaEvent,
    addMediaItems,
  } = useMediaSubscription(ndk, user, viewMode, getFollows);

  const {
    feed,
    feedLoading,
    pendingPosts,
    flushPendingPosts,
    replies,
    hasMoreFeed,
    hasMoreReplies,
    isLoadingMoreFeed,
    isLoadingMoreReplies,
    loadMoreFeed,
    loadMoreReplies,
    displayedFeedCount,
    setDisplayedFeedCount,
    displayedRepliesCount,
    setDisplayedRepliesCount,
  } = useFeedSubscription(ndk, user, viewMode, getFollows, processMediaEvent, addMediaItems);

  const { notifications, hasNewNotifs, setHasNewNotifs } = useNotificationSubscription(
    ndk,
    user,
    viewMode,
    allBlockedPubkeys,
    lastSeen,
    markAsRead
  );

  const { blogEvents, streamEvents } = useLongFormSubscription(ndk, user, viewMode, getFollows);

  const [displayedStreamsCount, setDisplayedStreamsCount] = useState(15);
  useEffect(() => {
    if (viewMode === 'streams') setDisplayedStreamsCount(15);
  }, [viewMode]);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width <= 600) setColumnCount(1);
      else if (width <= 900) setColumnCount(2);
      else setColumnCount(3);
    };

    handleResize(); // Set initial
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const MOODS = useMemo(
    () => [
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
    ],
    []
  );

  const handlePostStatus = async () => {
    if (!status.trim() || !ndk || !user) return;
    try {
      const event = new NDKEvent(ndk);
      event.kind = 1;

      // Include mood in content for cross-client compatibility
      let finalContent = status;
      if (mood !== 'None') {
        finalContent = `Mood: ${mood}\n\n${status}`;
        event.tags.push(['mood', mood]);
      }

      event.content = finalContent;

      // Add mentions
      const mentionedPubkeys = extractMentions(finalContent);
      mentionedPubkeys.forEach((pubkey) => {
        event.tags.push(['p', pubkey]);
      });

      event.tags.push(['client', 'MyNostrSpace']);
      await event.publish();
      setStatus('');
      setMood('None');
      // Refresh feed would happen via the subscription
    } catch (e) {
      console.error('Failed to post status:', e);
    }
  };

  return (
    <div className="home-page-container">
      {layoutCss && <style>{layoutCss}</style>}
      <SEO title="Home" description="Share updates and connect with friends on Nostr." />
      <div className="home-wrapper">
        <Navbar />
        <div className="home-content">
          <div className="home-header-top">
            <h1>Home</h1>
          </div>

          <div className="home-layout">
            <HomeSidebar
              user={user}
              stats={stats}
              loadingStats={loadingStats}
              fetchStats={fetchStats}
            />

            {/* Main Content */}
            <div className="home-main">
              <div className="home-box status-mood-box">
                <div className="status-mood-header">Status & Mood</div>
                <div className="status-input-container">
                  <MentionInput
                    value={status}
                    setValue={setStatus}
                    placeholder="Update your status..."
                    className="status-input nostr-input"
                    style={{ minHeight: '60px' }}
                  />
                  <div className="status-controls">
                    <div className="mood-selector">
                      Mood:
                      <select
                        className="nostr-input"
                        style={{ width: 'auto', display: 'inline-block', marginLeft: '5px' }}
                        value={mood}
                        onChange={(e) => setMood(e.target.value)}
                      >
                        {MOODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="upload-buttons" style={{ display: 'flex', gap: '5px' }}>
                      <button
                        onClick={handlePostStatus}
                        className="post-status-btn"
                        style={{ background: '#ff9933', color: 'white', borderColor: '#ff9933' }}
                      >
                        Post
                      </button>
                      <button
                        onClick={() => {
                          setMediaModalType('photo');
                          setIsMediaModalOpen(true);
                        }}
                        className="post-status-btn"
                      >
                        Photo
                      </button>
                      <button
                        onClick={() => {
                          setMediaModalType('video');
                          setIsMediaModalOpen(true);
                        }}
                        className="post-status-btn"
                      >
                        Video
                      </button>
                    </div>
                  </div>
                </div>
              </div>

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
                  className={viewMode === 'replies' ? 'active' : ''}
                  onClick={() => setViewMode('replies')}
                >
                  Replies
                </button>
                <button
                  className={viewMode === 'blog' ? 'active' : ''}
                  onClick={() => setViewMode('blog')}
                >
                  Blog
                </button>
                <button
                  className={viewMode === 'streams' ? 'active' : ''}
                  onClick={() => setViewMode('streams')}
                >
                  Live
                </button>
                <button
                  className={viewMode === 'notifications' ? 'active' : ''}
                  onClick={() => {
                    setViewMode('notifications');
                    setHasNewNotifs(false);
                  }}
                  style={{ position: 'relative' }}
                >
                  Notifications
                  {hasNewNotifs && <span className="unread-dot"></span>}
                </button>
              </div>

              <HomeFeedTabs
                viewMode={viewMode}
                columnCount={columnCount}
                feed={feed}
                feedLoading={feedLoading}
                pendingPosts={pendingPosts}
                flushPendingPosts={flushPendingPosts}
                displayedFeedCount={displayedFeedCount}
                setDisplayedFeedCount={setDisplayedFeedCount}
                hasMoreFeed={hasMoreFeed}
                isLoadingMoreFeed={isLoadingMoreFeed}
                loadMoreFeed={loadMoreFeed}
                mediaItems={mediaItems}
                mediaLoading={mediaLoading}
                hasMoreMedia={hasMoreMedia}
                isLoadingMoreMedia={isLoadingMoreMedia}
                loadMoreMedia={loadMoreMedia}
                blogEvents={blogEvents}
                streamEvents={streamEvents}
                displayedStreamsCount={displayedStreamsCount}
                setDisplayedStreamsCount={setDisplayedStreamsCount}
                replies={replies}
                isRepliesLoading={isLoadingMoreReplies} // Note: previously isRepliesLoading logic
                displayedRepliesCount={displayedRepliesCount}
                setDisplayedRepliesCount={setDisplayedRepliesCount}
                hasMoreReplies={hasMoreReplies}
                isLoadingMoreReplies={isLoadingMoreReplies}
                loadMoreReplies={loadMoreReplies}
                notifications={notifications}
              />
            </div>
          </div>
        </div>
      </div>

      <MediaUpload
        isOpen={isMediaModalOpen}
        onClose={() => setIsMediaModalOpen(false)}
        type={mediaModalType}
        onUploadComplete={() => {
          setStatus('');
          setMood('None');
        }}
        mood={mood}
      />
      <BlogEditor
        isOpen={isBlogModalOpen}
        onClose={() => setIsBlogModalOpen(false)}
        onPostComplete={() => { }}
      />
    </div>
  );
};

export default HomePage;

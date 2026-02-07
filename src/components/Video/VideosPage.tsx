import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { type NDKFilter, NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import { SEO } from '../Shared/SEO';
import { VideoThumbnail } from '../Shared/VideoThumbnail';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { isBlockedUser, hasBlockedKeyword } from '../../utils/blockedUsers';
import './VideosPage.css';

interface VideoFile {
  id: string;
  pubkey: string;
  url: string;
  title: string;
  thumbnail?: string;
  mime?: string;
  authorName?: string;
  created_at: number;
}

const BLOCKED_TAGS = ['nsfw', 'explicit', 'porn', 'xxx', 'content-warning'];

export const VideosPage = () => {
  const { ndk, user: loggedInUser } = useNostr();
  const { layoutCss } = useCustomLayout(loggedInUser?.pubkey);
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoFile | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const videoBufferRef = useRef<VideoFile[]>([]);
  const isUpdatePendingRef = useRef(false);
  const fetchingRef = useRef(false);
  const loadTrackerRef = useRef(0);

  const checkIsNSFW = (event: NDKEvent): boolean => {
    const tags = event.tags.map((t) => t[1]?.toLowerCase());
    if (tags.some((t) => BLOCKED_TAGS.includes(t))) return true;

    const cw = event.getMatchingTags('content-warning')[0]?.[1];
    if (cw) return true;

    const textToMatch = [
      event.content,
      event.getMatchingTags('title')[0]?.[1],
      event.getMatchingTags('description')[0]?.[1],
      event.getMatchingTags('alt')[0]?.[1],
    ].join(' ');

    return hasBlockedKeyword(textToMatch);
  };

  const processBuffer = useCallback(() => {
    if (videoBufferRef.current.length === 0) return;

    setVideos((prev) => {
      const next = [...prev];
      let changed = false;

      for (const video of videoBufferRef.current) {
        if (!next.find((v) => v.id === video.id)) {
          next.push(video);
          changed = true;
        }
      }

      videoBufferRef.current = [];
      isUpdatePendingRef.current = false;

      if (!changed) return prev;
      return next.sort((a, b) => b.created_at - a.created_at);
    });
  }, []);

  const handleEvent = useCallback(
    (event: NDKEvent) => {
      if (isBlockedUser(event.pubkey)) return;
      if (checkIsNSFW(event)) return;

      let url: string | undefined;
      let mime = 'video/mp4';
      let title = '';
      let thumbnail: string | undefined;

      if (event.kind === 1) {
        const content = event.content;
        const imetaTags = event.getMatchingTags('imeta');

        for (const tag of imetaTags) {
          let tagUrl: string | undefined;
          let tagMime: string | undefined;
          for (let i = 1; i < tag.length; i++) {
            const part = tag[i];
            if (part === 'url') tagUrl = tag[i + 1];
            else if (part.startsWith('url ')) tagUrl = part.slice(4);
            else if (part === 'm') tagMime = tag[i + 1];
            else if (part.startsWith('m ')) tagMime = part.slice(2);
          }
          if (tagUrl && tagMime?.startsWith('video/') && !tagUrl.includes('.m3u8')) {
            url = tagUrl;
            mime = tagMime;
            break;
          }
        }

        if (!url) {
          // Improved video link matching - catch more formats and hosting sites
          const content = event.content;

          // Check for direct video file links
          const videoFileMatch = content.match(
            /https?:\/\/[^\s]+\.(mp4|mov|webm|ogv|avi|mkv|m3u8)(\?[^\s]*)?/i
          );
          if (videoFileMatch) {
            url = videoFileMatch[0];
            const ext = videoFileMatch[1].toLowerCase();
            mime = `video/${ext === 'ogv' ? 'ogg' : ext === 'm3u8' ? 'mpegurl' : ext}`;
          }

          // Check for video hosting platforms
          if (!url) {
            // YouTube
            const youtubeMatch = content.match(
              /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/
            );
            if (youtubeMatch) {
              url = `https://www.youtube.com/watch?v=${youtubeMatch[1]}`;
              mime = 'video/youtube';
              // Generate YouTube thumbnail
              thumbnail = `https://img.youtube.com/vi/${youtubeMatch[1]}/maxresdefault.jpg`;
            }
          }

          if (!url) {
            // Vimeo
            const vimeoMatch = content.match(/vimeo\.com\/(\d+)/);
            if (vimeoMatch) {
              url = `https://vimeo.com/${vimeoMatch[1]}`;
              mime = 'video/vimeo';
            }
          }

          if (!url) {
            // Streamable
            const streamableMatch = content.match(/streamable\.com\/([a-zA-Z0-9]+)/);
            if (streamableMatch) {
              url = `https://streamable.com/${streamableMatch[1]}`;
              mime = 'video/streamable';
            }
          }
        }

        if (url) {
          // Track that we actually found a valid video event
          if (loadingMore) {
            loadTrackerRef.current++;
          }
          // IMPROVED TITLE PARSING: filter out lines that are just URLs or nostr: links
          const lines = content
            .split('\n')
            .map((l) => l.trim())
            .filter(
              (l) =>
                l.length > 0 &&
                !l.startsWith('http') &&
                !l.startsWith('ws') &&
                !l.startsWith('nostr:')
            );

          title = lines[0]?.length > 100 ? lines[0].slice(0, 100) + '...' : lines[0];
          if (!title) title = 'Video Post';

          // Improved thumbnail extraction - only if not already set (e.g., from YouTube)
          if (!thumbnail) {
            thumbnail =
              event.getMatchingTags('thumb')[0]?.[1] || event.getMatchingTags('image')[0]?.[1];
          }

          if (!thumbnail) {
            for (const tag of imetaTags) {
              let tagUrl: string | undefined;
              let tagMime: string | undefined;
              for (let i = 1; i < tag.length; i++) {
                const part = tag[i];
                if (part === 'url') tagUrl = tag[i + 1];
                else if (part.startsWith('url ')) tagUrl = part.slice(4);
                else if (part === 'm') tagMime = tag[i + 1];
                else if (part.startsWith('m ')) tagMime = part.slice(2);
              }
              if (tagUrl && tagMime?.startsWith('image/')) {
                thumbnail = tagUrl;
                break;
              }
            }
          }

          // Fallback: extract any image URL from content
          if (!thumbnail) {
            const imgMatches = content.match(
              /https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif)(\?[^\s]*)?/gi
            );
            if (imgMatches) {
              thumbnail = imgMatches.find((m) => m !== url);
            }
          }
        } else {
          return;
        }
      }

      if (url) {
        const video: VideoFile = {
          id: event.id,
          pubkey: event.pubkey,
          url,
          title: title || 'Untitled Video',
          mime,
          thumbnail: thumbnail,
          created_at: event.created_at || 0,
        };

        videoBufferRef.current.push(video);
        if (!isUpdatePendingRef.current) {
          isUpdatePendingRef.current = true;
          setTimeout(processBuffer, 300);
        }

        // Fetch profile
        ndk
          ?.getUser({ pubkey: event.pubkey })
          .fetchProfile()
          .then((profile) => {
            setVideos((prev) =>
              prev.map((v) =>
                v.pubkey === event.pubkey && !v.authorName
                  ? {
                    ...v,
                    authorName:
                      profile?.name ||
                      profile?.displayName ||
                      profile?.nip05 ||
                      event.pubkey.slice(0, 8),
                  }
                  : v
              )
            );
          })
          .catch(() => { });
      }
    },
    [ndk, loadingMore, processBuffer]
  );

  useEffect(() => {
    if (!ndk) return;

    setLoading(true);

    const filter: NDKFilter = {
      kinds: [1],
      limit: 100,
    };

    // Use CACHE_FIRST to show content immediately from local storage
    const sub = ndk.subscribe(filter, {
      closeOnEose: false,
      cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
    });

    sub.on('event', handleEvent);
    sub.on('eose', () => {
      setLoading(false);
      processBuffer();
      console.log('Video Page: Initial fetch complete');
    });

    return () => {
      sub.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ndk, handleEvent]);

  const handleLoadMore = useCallback(async () => {
    if (!ndk || videos.length === 0 || loadingMore || fetchingRef.current || !hasMore) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    loadTrackerRef.current = 0; // Reset tracker for this cycle

    const oldestTimestamp = Math.min(...videos.map((v) => v.created_at));
    console.log(
      'Video Page: Loading more videos before',
      new Date(oldestTimestamp * 1000).toLocaleString()
    );

    const filter: NDKFilter = {
      kinds: [1],
      until: oldestTimestamp - 1,
      limit: 100,
    };

    const sub = ndk.subscribe(filter, { closeOnEose: true });
    sub.on('event', handleEvent);
    sub.on('eose', () => {
      setLoadingMore(false);
      fetchingRef.current = false;
      processBuffer();

      // If no new videos were tracked during this entire subscription, assume we hit the end
      if (loadTrackerRef.current === 0) {
        console.log('Video Page: No more videos found, disabling infinite scroll.');
        setHasMore(false);
      }

      console.log('Video Page: Load More complete, found:', loadTrackerRef.current);
    });
  }, [ndk, videos, loadingMore, hasMore, handleEvent, processBuffer]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollBottom = window.innerHeight + window.scrollY;
      const threshold = document.body.offsetHeight - 800;

      if (
        scrollBottom >= threshold &&
        !fetchingRef.current &&
        videos.length > 0 &&
        !loadingMore &&
        hasMore
      ) {
        handleLoadMore();
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [videos.length, loadingMore, hasMore, handleLoadMore]);

  return (
    <div className="home-page-container vp-page-container">
      {layoutCss && <style>{layoutCss}</style>}
      <SEO
        title="Videos"
        description="Watch and discover videos shared across the Nostr network."
      />

      <div className="home-wrapper vp-wrapper">
        <Navbar />

        <div className="home-content vp-content">
          <h2 className="vp-section-header">Last Videos from Relays</h2>

          {loading && videos.length === 0 ? (
            <div className="vp-loading-state">
              <div className="vp-spinner"></div>
              <p>Searching for videos on Nostr...</p>
            </div>
          ) : (
            <>
              <div className="vp-videos-grid">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    className="vp-video-card"
                    onClick={() => setSelectedVideo(video)}
                  >
                    <div className="vp-thumbnail-container">
                      {video.thumbnail ? (
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="vp-video-thumbnail"
                          loading="lazy"
                        />
                      ) : (
                        <VideoThumbnail
                          src={video.url}
                          className="vp-video-thumbnail"
                        />
                      )}
                      <div className="vp-badge">
                        {video.mime?.split('/')[1]?.toUpperCase() || 'MP4'}
                      </div>
                    </div>
                    <div className="vp-video-info">
                      <div className="vp-video-title" title={video.title}>
                        {video.title}
                      </div>
                      <Link
                        to={`/p/${video.pubkey}`}
                        className="vp-video-author"
                        onClick={(e) => e.stopPropagation()}
                      >
                        By: {video.authorName || video.pubkey.slice(0, 8)}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {loadingMore && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                  Loading older videos...
                </div>
              )}

              {!loadingMore && hasMore && videos.length > 0 && (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <button
                    onClick={handleLoadMore}
                    style={{
                      padding: '12px 24px',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#fff',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
                    }}
                  >
                    Load More Videos
                  </button>
                </div>
              )}

              {!hasMore && videos.length > 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                  No more videos to load
                </div>
              )}
            </>
          )}

          {!loading && videos.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              No videos found. Check back later or try adding more relays!
            </div>
          )}
        </div>
      </div>

      {selectedVideo && (
        <div className="vp-modal-overlay" onClick={() => setSelectedVideo(null)}>
          <div className="vp-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="vp-modal-header">
              <h3>{selectedVideo.title}</h3>
              <button className="vp-close-btn" onClick={() => setSelectedVideo(null)}>
                ×
              </button>
            </div>
            <div className="vp-modal-body">
              {selectedVideo.mime === 'video/youtube' ? (
                <iframe
                  src={`https://www.youtube.com/embed/${selectedVideo.url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1]}`}
                  title={selectedVideo.title}
                  className="vp-player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : selectedVideo.mime === 'video/vimeo' ? (
                <iframe
                  src={`https://player.vimeo.com/video/${selectedVideo.url.match(/vimeo\.com\/(\d+)/)?.[1]}`}
                  title={selectedVideo.title}
                  className="vp-player"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              ) : selectedVideo.mime === 'video/streamable' ? (
                <iframe
                  src={`https://streamable.com/e/${selectedVideo.url.match(/streamable\.com\/([a-zA-Z0-9]+)/)?.[1]}`}
                  title={selectedVideo.title}
                  className="vp-player"
                  allowFullScreen
                />
              ) : (
                <video
                  src={selectedVideo.url}
                  poster={selectedVideo.thumbnail}
                  controls
                  autoPlay
                  className="vp-player"
                />
              )}
            </div>
            <div className="vp-modal-footer">
              <Link to={`/p/${selectedVideo.pubkey}`} className="vp-modal-author">
                By: {selectedVideo.authorName || selectedVideo.pubkey.slice(0, 8)}
              </Link>
              <a
                href={selectedVideo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="vp-download"
              >
                Format: {selectedVideo.mime}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

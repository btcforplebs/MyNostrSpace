import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useProfile } from '../../hooks/useProfile';
import { useTop8 } from '../../hooks/useTop8';
import { CommentWall } from './CommentWall';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { useExtendedProfile } from '../../hooks/useExtendedProfile';
import { useResolvedPubkey } from '../../hooks/useResolvedPubkey';
import { useNostr } from '../../context/NostrContext';
import { WavlakePlayer } from '../Music/WavlakePlayer';
import { ContactBox } from './ContactBox';
import { Navbar } from '../Shared/Navbar';
import { RichTextRenderer } from '../Shared/RichTextRenderer';
import { SEO } from '../Shared/SEO';
import { useLightbox } from '../../context/LightboxContext';
import {
  type NDKEvent,
  NDKRelaySet,
  type NDKFilter,
  NDKSubscriptionCacheUsage,
  NDKKind,
} from '@nostr-dev-kit/ndk';
import { FeedItem } from '../Shared/FeedItem';
import './ProfilePage.css';
import { filterRelays } from '../../utils/relay';

// --- Tab Sub-Components ---

const ProfileRecipes = ({ pubkey }: { pubkey: string }) => {
  const { ndk } = useNostr();
  const [recipes, setRecipes] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ndk || !pubkey) return;
    const fetchRecipes = async () => {
      const events = await ndk.fetchEvents({
        kinds: [30023 as number],
        authors: [pubkey],
        '#t': ['zapcooking', 'nostrcooking'], // Filter for recipes
      });
      setRecipes(Array.from(events));
      setLoading(false);
    };
    fetchRecipes();
  }, [ndk, pubkey]);

  if (loading) return <div>Loading recipes...</div>;
  if (recipes.length === 0) return <div>No recipes found.</div>;

  return (
    <div className="profile-recipes-list">
      {recipes.map((evt) => {
        const title =
          evt.tags.find((t) => t[0] === 'title')?.[1] ||
          evt.tags.find((t) => t[0] === 'd')?.[1] ||
          'Untitled';
        const image = evt.tags.find((t) => t[0] === 'image')?.[1];
        const summary = evt.tags.find((t) => t[0] === 'summary')?.[1];

        return (
          <div
            key={evt.id}
            style={{
              marginBottom: '15px',
              padding: '10px',
              border: '1px solid #ccc',
              background: 'white',
              display: 'flex',
              gap: '10px',
            }}
          >
            {image && (
              <img src={image} style={{ width: '80px', height: '80px', objectFit: 'cover' }} />
            )}
            <div>
              <div style={{ fontWeight: 'bold', color: '#003399' }}>{title}</div>
              {summary && <div style={{ fontSize: '0.9em', color: '#666' }}>{summary}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ProfileBlog = ({ pubkey }: { pubkey: string }) => {
  const { ndk } = useNostr();
  const [posts, setPosts] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ndk || !pubkey) return;
    const fetchPosts = async () => {
      const events = await ndk.fetchEvents({
        kinds: [30023 as number],
        authors: [pubkey],
      });

      // Filter out obvious recipes if we want strict separation
      const blogPosts = Array.from(events).filter((evt) => {
        const tags = evt.tags.map((t) => t[1]);
        return !tags.includes('zapcooking') && !tags.includes('nostrcooking');
      });

      setPosts(blogPosts);
      setLoading(false);
    };
    fetchPosts();
  }, [ndk, pubkey]);

  if (loading) return <div>Loading posts...</div>;
  if (posts.length === 0) return <div>No blog posts found.</div>;

  return (
    <div className="profile-blog-list">
      {posts.map((evt) => {
        const title =
          evt.tags.find((t) => t[0] === 'title')?.[1] ||
          evt.tags.find((t) => t[0] === 'd')?.[1] ||
          'Untitled';
        const summary = evt.tags.find((t) => t[0] === 'summary')?.[1];
        return (
          <div
            key={evt.id}
            style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px dashed #ccc' }}
          >
            <div style={{ fontWeight: 'bold', color: '#003399', fontSize: '1.1em' }}>{title}</div>
            <div style={{ fontSize: '0.8em', color: '#999', marginBottom: '5px' }}>
              {new Date(evt.created_at! * 1000).toLocaleDateString()}
            </div>
            {summary && <div>{summary}</div>}
          </div>
        );
      })}
    </div>
  );
};

const ProfileFeed = ({ pubkey }: { pubkey: string }) => {
  const { ndk } = useNostr();
  const [events, setEvents] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [until, setUntil] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchFeed = useCallback(
    async (untilTimestamp?: number) => {
      if (!ndk || !pubkey) return;

      try {
        const filter: NDKFilter = {
          kinds: [1],
          authors: [pubkey],
          limit: 10,
        };
        if (untilTimestamp) {
          filter.until = untilTimestamp;
        }

        const fetched = await ndk.fetchEvents(filter);
        const newEvents = Array.from(fetched).sort((a, b) => b.created_at! - a.created_at!);

        if (newEvents.length < 10) {
          setHasMore(false);
        }

        if (newEvents.length > 0) {
          setUntil(newEvents[newEvents.length - 1].created_at! - 1);
          setEvents((prev) => {
            // Dedupe just in case
            const combined = [...prev, ...newEvents];
            const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values());
            return unique.sort((a, b) => b.created_at! - a.created_at!);
          });
        } else {
          setHasMore(false);
        }
      } catch (e) {
        console.error('Error fetching feed:', e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [ndk, pubkey]
  );

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && until) {
      setLoadingMore(true);
      fetchFeed(until);
    }
  };

  if (loading) return <div>Loading feed...</div>;

  return (
    <div className="profile-feed-section">
      <h3 className="section-header">
        {events.length > 0 ? 'Recent Activity' : 'No recent activity'}
      </h3>
      <div className="profile-feed-list">
        {events.map((event) => (
          <FeedItem key={event.id} event={event} />
        ))}
      </div>
      {hasMore && events.length > 0 && (
        <div style={{ textAlign: 'center', padding: '10px' }}>
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{
              padding: '5px 15px',
              cursor: 'pointer',
              backgroundColor: '#eee',
              border: '1px solid #ccc',
              borderRadius: '3px',
              fontWeight: 'bold',
              color: '#333',
            }}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
};

// --- ProfilePhotos (Masonry) ---

interface PhotoFile {
  id: string;
  pubkey: string;
  url: string;
  title: string;
  authorName?: string;
  created_at: number;
}

const ProfilePhotos = ({ pubkey }: { pubkey: string }) => {
  const { ndk } = useNostr();
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoFile | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [columnCount, setColumnCount] = useState(3);

  const photoBufferRef = useRef<PhotoFile[]>([]);
  const isUpdatePendingRef = useRef(false);
  const fetchingRef = useRef(false);
  const loadTrackerRef = useRef(0);

  // Buffer processing
  const processBuffer = useCallback(() => {
    if (photoBufferRef.current.length === 0) return;

    setPhotos((prev) => {
      const next = [...prev];
      let changed = false;
      for (const photo of photoBufferRef.current) {
        if (!next.find((p) => p.id === photo.id)) {
          next.push(photo);
          changed = true;
        }
      }
      photoBufferRef.current = [];
      isUpdatePendingRef.current = false;
      if (!changed) return prev;
      return next.sort((a, b) => b.created_at - a.created_at);
    });
  }, []);

  const handleEvent = useCallback(
    (event: NDKEvent) => {
      // Basic NSFW check (simplified for profile view)
      const tags = event.tags.map((t) => t[1]?.toLowerCase());
      if (tags.some((t) => ['nsfw', 'explicit', 'porn', 'xxx'].includes(t))) return;

      let url: string | undefined;
      let title = '';

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
          if (tagUrl && tagMime?.startsWith('image/')) {
            url = tagUrl;
            break;
          }
        }

        if (!url) {
          const imgMatches = content.match(
            /https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif)(\?[^\s]*)?/i
          );
          if (imgMatches) url = imgMatches[0];
        }

        if (url) {
          if (loadingMore) loadTrackerRef.current++;
          const titleTag = event.getMatchingTags('title')[0]?.[1];
          title = titleTag || 'Untitled Photo';

          const photo: PhotoFile = {
            id: event.id,
            pubkey: event.pubkey,
            url,
            title,
            created_at: event.created_at || 0,
          };

          photoBufferRef.current.push(photo);
          if (!isUpdatePendingRef.current) {
            isUpdatePendingRef.current = true;
            setTimeout(processBuffer, 300);
          }
        }
      }
    },
    [loadingMore, processBuffer]
  );

  useEffect(() => {
    if (!ndk || !pubkey) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const filter: NDKFilter = { kinds: [1], authors: [pubkey], limit: 20 };
    const sub = ndk.subscribe(filter, {
      closeOnEose: false,
      cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
    });
    sub.on('event', handleEvent);
    sub.on('eose', () => {
      setLoading(false);
      processBuffer();
    });
    return () => sub.stop();
  }, [ndk, pubkey, handleEvent, processBuffer]);

  const handleLoadMore = useCallback(async () => {
    if (!ndk || photos.length === 0 || loadingMore || fetchingRef.current || !hasMore) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    loadTrackerRef.current = 0;

    const oldestTimestamp = Math.min(...photos.map((p) => p.created_at));
    const filter: NDKFilter = {
      kinds: [1],
      authors: [pubkey],
      until: oldestTimestamp - 1,
      limit: 50,
    };
    const sub = ndk.subscribe(filter, { closeOnEose: true });
    sub.on('event', handleEvent);
    sub.on('eose', () => {
      setLoadingMore(false);
      fetchingRef.current = false;
      processBuffer();
      if (loadTrackerRef.current === 0) setHasMore(false);
    });
  }, [ndk, pubkey, photos, loadingMore, hasMore, handleEvent, processBuffer]);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width <= 600)
        setColumnCount(2); // Keep 2 columns on mobile for profile tabs usually
      else setColumnCount(3);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const columns = Array.from({ length: columnCount }, () => [] as PhotoFile[]);
  photos.forEach((photo, index) => {
    columns[index % columnCount].push(photo);
  });

  if (loading && photos.length === 0) return <div>Loading photos...</div>;
  if (photos.length === 0) return <div>No photos found.</div>;

  return (
    <div className="profile-photos-section">
      <div className="pp-photos-grid-container" style={{ display: 'flex', gap: '15px' }}>
        {columns.map((colPhotos, colIndex) => (
          <div
            key={colIndex}
            className="pp-masonry-column"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}
          >
            {colPhotos.map((photo) => (
              <div
                key={photo.id}
                className="pp-photo-card"
                onClick={() => setSelectedPhoto(photo)}
                style={{ cursor: 'pointer' }}
              >
                <img
                  src={photo.url}
                  alt={photo.title}
                  style={{ width: '100%', display: 'block' }}
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {hasMore && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{ padding: '8px 16px', cursor: 'pointer' }}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {selectedPhoto && (
        <div
          className="pp-modal-overlay"
          onClick={() => setSelectedPhoto(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div
            className="pp-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '90vh', maxWidth: '90vw' }}
          >
            <img
              src={selectedPhoto.url}
              alt={selectedPhoto.title}
              style={{ maxHeight: '80vh', maxWidth: '100%' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// --- ProfileVideos ---

interface VideoItem {
  id: string;
  url: string;
  thumb?: string;
  title: string;
  created_at: number;
}

const ProfileVideos = ({ pubkey }: { pubkey: string }) => {
  const { ndk } = useNostr();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [until, setUntil] = useState<number | null>(null);

  const fetchVideos = useCallback(
    async (untilTimestamp?: number) => {
      if (!ndk || !pubkey) return;

      try {
        const filter: NDKFilter = {
          kinds: [1, 1063],
          authors: [pubkey],
          limit: 10,
        };
        if (untilTimestamp) {
          filter.until = untilTimestamp;
        }

        const events = await ndk.fetchEvents(filter);
        const videoItems: VideoItem[] = [];

        for (const event of events) {
          let url = '';
          let thumb = '';
          const title = 'Untitled Video'; // Could parse title tag if available

          if (event.kind === 1063) {
            url = event.tags.find((t) => t[0] === 'url')?.[1] || '';
            thumb = event.tags.find((t) => t[0] === 'thumb' || t[0] === 'image')?.[1] || '';
          } else if (event.kind === 1) {
            const content = event.content;

            // First check imeta tags for video URLs (used by Primal, Damus, etc.)
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
              if (tagUrl && tagMime?.startsWith('video/')) {
                url = tagUrl;
                break;
              }
            }

            // Fallback to content regex if no imeta video found
            if (!url) {
              // Video regex - handles URLs with query params like video.mp4?token=xxx
              const vidMatch = content.match(/(https?:\/\/\S+\.(?:mp4|mov|webm|avi|mkv|m3u8))(\?\S*)?/i);
              const ytMatch = content.match(
                /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/
              );
              const vimeoMatch = content.match(/vimeo\.com\/(\d+)/);

              if (vidMatch) url = vidMatch[0];
              else if (ytMatch) {
                url = `https://www.youtube.com/watch?v=${ytMatch[1]}`;
                thumb = `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
              } else if (vimeoMatch) url = `https://vimeo.com/${vimeoMatch[1]}`;
            }
          }

          if (url) {
            videoItems.push({
              id: event.id,
              url,
              thumb,
              title,
              created_at: event.created_at || 0,
            });
          }
        }

        const sortedNewVideos = videoItems.sort((a, b) => b.created_at - a.created_at);

        // Always update `until` based on all fetched events, not just videos found.
        // This allows pagination to continue through events that don't contain videos.
        const eventsArray = Array.from(events);
        if (eventsArray.length > 0) {
          const oldestEvent = eventsArray.reduce((oldest, e) =>
            (e.created_at || 0) < (oldest.created_at || 0) ? e : oldest
          );
          setUntil((oldestEvent.created_at || 0) - 1);
        }

        // Set hasMore to false only when we've exhausted events
        if (events.size < 10) {
          setHasMore(false);
        }

        // Add any videos found to state
        if (sortedNewVideos.length > 0) {
          setVideos((prev) => {
            const combined = [...prev, ...sortedNewVideos];
            // Dedupe
            const unique = Array.from(new Map(combined.map((v) => [v.id, v])).values());
            return unique.sort((a, b) => b.created_at - a.created_at);
          });
        }
      } catch (e) {
        console.error('Error fetching videos:', e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [ndk, pubkey]
  );

  useEffect(() => {
    setLoading(true);
    fetchVideos();
  }, [fetchVideos]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && until) {
      setLoadingMore(true);
      fetchVideos(until);
    }
  };

  if (loading) return <div>Loading videos...</div>;
  if (videos.length === 0) return <div>No videos found.</div>;

  return (
    <div className="profile-videos-section">
      <div
        className="profile-videos-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '15px',
        }}
      >
        {videos.map((video) => {
          const ytMatch = video.url.match(
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/
          );
          const vimeoMatch = video.url.match(/vimeo\.com\/(\d+)/);

          return (
            <div
              key={video.id}
              style={{ border: '1px solid #ccc', background: '#000', aspectRatio: '16/9' }}
            >
              {ytMatch ? (
                <iframe
                  src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                  title="YouTube"
                  frameBorder="0"
                  allowFullScreen
                  style={{ width: '100%', height: '100%' }}
                />
              ) : vimeoMatch ? (
                <iframe
                  src={`https://player.vimeo.com/video/${vimeoMatch[1]}`}
                  title="Vimeo"
                  frameBorder="0"
                  allowFullScreen
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (
                <video src={video.url} controls style={{ width: '100%', height: '100%' }} />
              )}
            </div>
          );
        })}
      </div>
      {hasMore && videos.length > 0 && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{
              padding: '5px 15px',
              cursor: 'pointer',
              backgroundColor: '#eee',
              border: '1px solid #ccc',
              borderRadius: '3px',
              fontWeight: 'bold',
              color: '#333',
            }}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
};

// --- ProfileLivestreams ---

const ProfileLivestreams = ({ pubkey }: { pubkey: string }) => {
  const { ndk } = useNostr();
  const [streams, setStreams] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ndk || !pubkey) return;
    const fetchStreams = async () => {
      const events = await ndk.fetchEvents({
        kinds: [30311 as NDKKind],
        authors: [pubkey],
        limit: 20,
      });
      setStreams(Array.from(events).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)));
      setLoading(false);
    };
    fetchStreams();
  }, [ndk, pubkey]);

  if (loading) return <div>Loading streams...</div>;
  if (streams.length === 0) return <div>No livestreams found.</div>;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: '15px',
      }}
    >
      {streams.map((stream) => {
        const title = stream.getMatchingTags('title')[0]?.[1] || 'Untitled Stream';
        const image = stream.getMatchingTags('image')[0]?.[1];
        const status = stream.getMatchingTags('status')[0]?.[1] || 'offline';
        const dTag = stream.getMatchingTags('d')[0]?.[1];
        const url = `/live/${pubkey}/${dTag}`;

        return (
          <Link
            key={stream.id}
            to={url}
            style={{
              textDecoration: 'none',
              color: 'inherit',
              border: '1px solid #ccc',
              display: 'block',
              background: 'white',
            }}
          >
            <div style={{ aspectRatio: '16/9', background: '#000', position: 'relative' }}>
              {image && (
                <img src={image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              <span
                style={{
                  position: 'absolute',
                  top: 5,
                  right: 5,
                  background: status === 'live' ? 'red' : '#666',
                  color: 'white',
                  padding: '2px 5px',
                  fontSize: '10px',
                  borderRadius: 3,
                  textTransform: 'uppercase',
                }}
              >
                {status}
              </span>
            </div>
            <div style={{ padding: '10px' }}>
              <div style={{ fontWeight: 'bold', color: '#003399' }}>{title}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
};

// --- Main ProfilePage ---

const ProfilePage = () => {
  const { user, ndk } = useNostr();
  const { pubkey: identifier } = useParams<{ pubkey: string }>();
  const { hexPubkey, loading: resolving } = useResolvedPubkey(identifier);
  const { openLightbox } = useLightbox();

  const { profile, loading: profileLoading } = useProfile(hexPubkey || undefined);
  const { top8, loading: top8Loading } = useTop8(hexPubkey || undefined);

  const userObj = hexPubkey ? ndk?.getUser({ pubkey: hexPubkey }) : null;
  const npub = userObj?.npub;

  const { layoutCss } = useCustomLayout(hexPubkey || undefined);
  const { data: extendedProfile } = useExtendedProfile(hexPubkey || undefined);

  const [stats, setStats] = useState<{
    followers: number | null;
    posts: number | null;
    zaps: number | null;
  }>({
    followers: null,
    posts: null,
    zaps: null,
  });
  const [loadingStats, setLoadingStats] = useState(false);

  // Tab State
  const [activeTab, setActiveTab] = useState('home');
  const [hasPhotos, setHasPhotos] = useState(false);
  const [hasVideos, setHasVideos] = useState(false);
  const [hasRecipes, setHasRecipes] = useState(false);
  const [hasLivestreams, setHasLivestreams] = useState(false);
  const [hasBlog, setHasBlog] = useState(false);

  // Content Check Effect
  useEffect(() => {
    if (!ndk || !hexPubkey) return;

    const checkAll = async () => {
      // Check Photos (Kind 1 with image tag or regex, approximate check with limit 1)
      // Note: Regex checks on relays are limited, so we rely on client-side check of small batch or specific tags check if supported.
      // For now, simpler check: Kind 1
      // Actually, "Media" includes photos and videos.
      // Let's do a quick check for Kind 1 events.
      const photosCheck = await ndk.fetchEvents({ kinds: [1], authors: [hexPubkey], limit: 20 });
      const hasP = Array.from(photosCheck).some(
        (e) =>
          e.content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif)/i) ||
          e.getMatchingTags('imeta').length > 0
      );
      setHasPhotos(hasP);

      // Check Videos
      const videosCheck1 = await ndk.fetchEvents({ kinds: [1063], authors: [hexPubkey], limit: 1 });
      const videosCheck2 = Array.from(photosCheck).some((e) => {
        // Check imeta tags for video content
        const imetaTags = e.getMatchingTags('imeta');
        for (const tag of imetaTags) {
          let tagMime: string | undefined;
          for (let i = 1; i < tag.length; i++) {
            const part = tag[i];
            if (part === 'm') tagMime = tag[i + 1];
            else if (part.startsWith('m ')) tagMime = part.slice(2);
          }
          if (tagMime?.startsWith('video/')) return true;
        }
        // Fallback to content regex
        return (
          e.content.match(/(https?:\/\/\S+\.(?:mp4|mov|webm|avi|mkv|m3u8))(\?\S*)?/i) ||
          e.content.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)/)
        );
      });
      setHasVideos(videosCheck1.size > 0 || videosCheck2);

      // Check Recipes
      const recipesCheck = await ndk.fetchEvents({
        kinds: [30023 as number],
        authors: [hexPubkey],
        '#t': ['zapcooking', 'nostrcooking'],
        limit: 1,
      });
      setHasRecipes(recipesCheck.size > 0);

      // Check Livestreams
      const liveCheck = await ndk.fetchEvents({
        kinds: [30311 as NDKKind],
        authors: [hexPubkey],
        limit: 1,
      });
      setHasLivestreams(liveCheck.size > 0);

      // Check Blog
      const blogCheck = await ndk.fetchEvents({
        kinds: [30023 as number],
        authors: [hexPubkey],
        limit: 10,
      });
      const hasB = Array.from(blogCheck).some((e) => {
        const tags = e.tags.map((t) => t[1]);
        return !tags.includes('zapcooking') && !tags.includes('nostrcooking');
      });
      setHasBlog(hasB);
    };

    checkAll();
  }, [ndk, hexPubkey]);

  const fetchStats = async () => {
    if (loadingStats || !ndk || !hexPubkey) return;
    setLoadingStats(true);

    // Reset stats to 0 to start counting up
    setStats({ followers: 0, posts: 0, zaps: 0 });

    try {
      // 1. Get User's Preferred Relays (Kind 10002)
      const relayEvent = await ndk.fetchEvent({ kinds: [10002 as number], authors: [hexPubkey] });
      const relayUrls = relayEvent
        ? relayEvent.tags.filter((t) => t[0] === 'r').map((t) => t[1])
        : [];

      const targetRelays =
        relayUrls.length > 0 ? NDKRelaySet.fromRelayUrls(filterRelays(relayUrls), ndk) : undefined;

      // 2. Start Subscriptions (Streaming)
      const subOptions = { closeOnEose: true, relaySet: targetRelays };

      const followersSub = ndk.subscribe({ kinds: [3], '#p': [hexPubkey] }, subOptions);
      const postsSub = ndk.subscribe({ kinds: [1], authors: [hexPubkey] }, subOptions);
      const zapsSub = ndk.subscribe({ kinds: [9735], '#p': [hexPubkey] }, subOptions);

      followersSub.on('event', () => {
        setStats((prev) => ({ ...prev, followers: (prev.followers || 0) + 1 }));
      });

      postsSub.on('event', (ev: NDKEvent) => {
        if (!ev.tags.some((t) => t[0] === 'e')) {
          setStats((prev) => ({ ...prev, posts: (prev.posts || 0) + 1 }));
        }
      });

      zapsSub.on('event', (ev: NDKEvent) => {
        let amt = 0;
        const amountTag = ev.tags.find((t) => t[0] === 'amount');
        if (amountTag) {
          amt = parseInt(amountTag[1]) / 1000;
        } else {
          const bolt11 = ev.tags.find((t) => t[0] === 'bolt11')?.[1];
          if (bolt11) {
            const match = bolt11.match(/lnbc(\d+)([pnum])1/);
            if (match) {
              let val = parseInt(match[1]);
              const multiplier = match[2];
              if (multiplier === 'm') val *= 100000;
              else if (multiplier === 'u') val *= 100;
              else if (multiplier === 'n') val *= 0.1;
              else if (multiplier === 'p') val *= 0.0001;
              amt = val;
            }
          }
        }
        if (amt > 0) {
          setStats((prev) => ({ ...prev, zaps: Math.floor((prev.zaps || 0) + amt) }));
        }
      });

      let finishedCount = 0;
      const onDone = () => {
        finishedCount++;
        if (finishedCount >= 3) setLoadingStats(false);
      };

      followersSub.on('eose', onDone);
      postsSub.on('eose', onDone);
      zapsSub.on('eose', onDone);

      // Safety timeout
      setTimeout(() => setLoadingStats(false), 20000);
    } catch (e) {
      console.error('Error starting stats stream:', e);
      setLoadingStats(false);
    }
  };

  if (resolving) {
    return (
      <div className="loading-screen">
        <div className="loading-box">
          <div className="loading-header">MyNostrSpace.com</div>
          <div className="loading-body">
            <p>Loading Profile...</p>
            <p style={{ fontSize: '8pt' }}>(Please Wait)</p>
          </div>
        </div>
      </div>
    );
  }

  // Fallback name if profile isn't loaded yet
  const displayName =
    profile?.displayName || profile?.name || (hexPubkey ? `${hexPubkey.slice(0, 8)}...` : 'User');
  const displayAbout =
    profile?.about ||
    (profileLoading ? 'Loading info...' : 'Currently building my brand new NostrSpace page.');

  // Construct Tabs List
  const tabs = [
    { id: 'home', label: 'Home', visible: true },
    { id: 'notes', label: 'Notes', visible: true },
    { id: 'photos', label: 'Photos', visible: hasPhotos },
    { id: 'videos', label: 'Videos', visible: hasVideos },
    { id: 'recipes', label: 'Recipes', visible: hasRecipes },
    { id: 'livestream', label: 'Livestream', visible: hasLivestreams },
    { id: 'blog', label: 'Blog', visible: hasBlog },
  ].filter((t) => t.visible);

  return (
    <div className="profile-container">
      {layoutCss && <style>{layoutCss}</style>}

      <SEO
        title={displayName}
        description={`${displayName}'s profile on MyNostrSpace. ${profile?.about || ''}`}
        image={profile?.image}
        url={window.location.href}
      />

      {/* Header / Banner Area */}
      <div className="profile-header">
        <Navbar />
      </div>

      <div className="profile-body">
        {/* Left Column: Basic Info */}
        <div className="left-column">
          <div className="profile-pic-box">
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <h1>{displayName}</h1>
              {user?.pubkey === hexPubkey && (
                <Link
                  to="/edit-profile"
                  style={{ fontSize: '8pt', textDecoration: 'none', color: '#003399' }}
                >
                  [ Edit Profile ]
                </Link>
              )}
            </div>
            <div className="profile-details-grid">
              {profile?.image ? (
                <img
                  src={profile.image}
                  alt={profile.name || 'Profile'}
                  className="profile-pic"
                  onClick={() => openLightbox(profile.image!)}
                  style={{ cursor: 'pointer' }}
                />
              ) : (
                <div
                  className="profile-pic"
                  style={{
                    background: '#eee',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ?
                </div>
              )}
              <div className="profile-text-details">
                <div className="personal-text" style={{ fontSize: '8pt' }}>
                  <RichTextRenderer content={extendedProfile?.headline || '...'} />
                  <p>{extendedProfile?.gender}</p>
                  <p>
                    {[extendedProfile?.city, extendedProfile?.region, extendedProfile?.country]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
                {profile?.nip05 && (
                  <div
                    className="nip05"
                    style={{ fontSize: '8pt', color: '#666', fontWeight: 'bold' }}
                  >
                    {profile.nip05}
                  </div>
                )}
                <div className="last-login" style={{ fontSize: '8pt', margin: '10px 0' }}>
                  Last Login: {new Date().toLocaleDateString()}
                </div>
                <div
                  className="user-stats-clickable"
                  style={{
                    fontSize: '8pt',
                    marginTop: '5px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                  onClick={fetchStats}
                  title="Click to load stats"
                >
                  {loadingStats ? (
                    <span>Loading stats...</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span>Followers: {stats.followers ?? '∞'}</span>
                      <span>Posts: {stats.posts ?? '∞'}</span>
                      <span>Zaps Received: {stats.zaps ?? '∞'} 丰</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <ContactBox name={profile?.name || ''} pubkey={hexPubkey || ''} />

          <div className="url-box">
            <b>MyNostrSpace URL:</b>
            <br />
            http://mynostrspace.com/p/{npub || hexPubkey}
          </div>

          <div className="interests-box">
            <h3 className="section-header">{displayName}'s Interests</h3>
            <table className="interests-table myspace-table">
              <tbody>
                <tr>
                  <td className="label">General</td>
                  <td>
                    <RichTextRenderer content={extendedProfile?.interests?.general || 'N/A'} />
                  </td>
                </tr>
                <tr>
                  <td className="label">Music</td>
                  <td>
                    <RichTextRenderer content={extendedProfile?.interests?.music || 'N/A'} />
                  </td>
                </tr>
                <tr>
                  <td className="label">Movies</td>
                  <td>
                    <RichTextRenderer content={extendedProfile?.interests?.movies || 'N/A'} />
                  </td>
                </tr>
                {extendedProfile?.mainClient && (
                  <tr>
                    <td className="label">Client</td>
                    <td>{extendedProfile.mainClient}</td>
                  </tr>
                )}
                {extendedProfile?.bitcoinerSince && (
                  <tr>
                    <td className="label">Bitcoiner Since</td>
                    <td>{extendedProfile.bitcoinerSince}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pass the dynamic music URL or Playlist */}
          {Array.isArray(extendedProfile?.music) ? (
            <WavlakePlayer tracks={extendedProfile.music} />
          ) : (
            <WavlakePlayer trackUrl={extendedProfile?.music?.url} />
          )}
        </div>

        {/* Right Column: The "Dope" Content */}
        <div className="right-column">
          <div
            className="extended-network"
            style={{
              border: '1px solid black',
              padding: '10px',
              marginBottom: '15px',
              background: '#f5f5f5',
            }}
          >
            <h2 style={{ fontSize: '14pt', margin: 0 }}>
              {displayName} is in your extended network
            </h2>
          </div>

          {/* Profile Tabs */}
          <div className="profile-tabs" style={{ marginBottom: '0', display: 'flex', gap: '0' }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  backgroundColor: activeTab === tab.id ? 'var(--myspace-orange)' : '#eee',
                  color: activeTab === tab.id ? 'white' : '#333',
                  border: '1px solid #ccc',
                  borderBottom: 'none',
                  borderRadius: '5px 5px 0 0',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: HOME (Legacy Profile Content) */}
          {activeTab === 'home' && (
            <>
              <div className="blurbs-section">
                <h3 className="section-header">{displayName}'s Blurbs</h3>
                <div className="blurb-content" style={{ padding: '10px' }}>
                  <h4>About me:</h4>
                  <RichTextRenderer content={displayAbout} />

                  <h4>Who I'd like to meet:</h4>
                  <RichTextRenderer content="Developers building on Nostr and people enjoying freedom." />
                </div>
              </div>

              <div className="top-8-section">
                <h3 className="section-header">{displayName}'s Friend Space</h3>
                <div className="top-8-grid">
                  {top8Loading ? (
                    <div>Loading Top 8...</div>
                  ) : (
                    top8.map((friend) => (
                      <div
                        key={friend.pubkey}
                        className="friend-slot"
                        style={{ cursor: 'default' }}
                      >
                        <a href={`/p/${friend.npub}`}>
                          <p className="friend-name">
                            {friend.profile?.displayName || friend.profile?.name || 'Friend'}
                          </p>
                          <div className="friend-pic-container">
                            {friend.profile?.image ? (
                              <img
                                src={friend.profile.image}
                                alt={friend.profile?.name || 'Friend'}
                                className="friend-pic"
                                style={{
                                  width: '90px',
                                  height: '90px',
                                  objectFit: 'cover',
                                  border: '1px solid white',
                                }}
                              />
                            ) : (
                              <div
                                className="friend-pic"
                                style={{ background: '#eee', width: '90px', height: '90px' }}
                              ></div>
                            )}
                          </div>
                        </a>
                      </div>
                    ))
                  )}
                  {/* Fill empty slots if less than 8 */}
                  {!top8Loading &&
                    top8.length < 8 &&
                    [...Array(8 - top8.length)].map((_, i) => (
                      <div key={`empty-${i}`} className="friend-slot empty">
                        <p className="friend-name" style={{ visibility: 'hidden' }}>
                          Top 8
                        </p>
                        <div
                          className="friend-pic-placeholder"
                          style={{ width: '90px', height: '90px' }}
                        ></div>
                      </div>
                    ))}
                </div>
                <div
                  style={{
                    textAlign: 'right',
                    marginTop: '10px',
                    fontSize: '10pt',
                    fontWeight: 'bold',
                  }}
                >
                  View {displayName}'s Friends: <a href={`/p/${hexPubkey}/friends`}>All</a> |{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Coming soon!');
                    }}
                  >
                    Online
                  </a>{' '}
                  |{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Coming soon!');
                    }}
                  >
                    New
                  </a>
                </div>
              </div>

              {/* Comment Wall */}
              <div className="comment-wall-section" style={{ marginTop: '20px' }}>
                <CommentWall pubkey={hexPubkey || ''} />
              </div>
            </>
          )}

          {/* Tab: NOTES (Profile Feed) */}
          {activeTab === 'notes' && (
            <div className="profile-section-tab">
              <ProfileFeed pubkey={hexPubkey || ''} />
            </div>
          )}

          {/* Tab: PHOTOS */}
          {activeTab === 'photos' && (
            <div className="profile-section-tab">
              <h3 className="section-header">{displayName}'s Photos</h3>
              <ProfilePhotos pubkey={hexPubkey || ''} />
            </div>
          )}

          {/* Tab: VIDEOS */}
          {activeTab === 'videos' && (
            <div className="profile-section-tab">
              <h3 className="section-header">{displayName}'s Videos</h3>
              <ProfileVideos pubkey={hexPubkey || ''} />
            </div>
          )}

          {/* Tab: RECIPES */}
          {activeTab === 'recipes' && (
            <div className="profile-section-tab">
              <h3 className="section-header">{displayName}'s Recipes</h3>
              <ProfileRecipes pubkey={hexPubkey || ''} />
            </div>
          )}

          {/* Tab: LIVESTREAM */}
          {activeTab === 'livestream' && (
            <div className="profile-section-tab">
              <h3 className="section-header">{displayName}'s Livestreams</h3>
              <ProfileLivestreams pubkey={hexPubkey || ''} />
            </div>
          )}

          {/* Tab: BLOG */}
          {activeTab === 'blog' && (
            <div className="profile-section-tab">
              <h3 className="section-header">{displayName}'s Blog Posts</h3>
              <ProfileBlog pubkey={hexPubkey || ''} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;

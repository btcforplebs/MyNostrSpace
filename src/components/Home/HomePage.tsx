import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, type NDKFilter, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { Navbar } from '../Shared/Navbar';
import { FeedItem } from '../Shared/FeedItem';
import { SEO } from '../Shared/SEO';
import { MediaUpload } from './MediaUpload';
import { BlogEditor } from './BlogEditor';
import { WavlakePlayer } from '../Music/WavlakePlayer';
import { Avatar } from '../Shared/Avatar';
import './HomePage.css';

interface MusicTrack {
  title: string;
  url: string;
  link: string;
  artist?: string;
  albumArtUrl?: string;
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
  const [status, setStatus] = useState('');
  const [mood, setMood] = useState('None');
  const [isLoadingMoreFeed, setIsLoadingMoreFeed] = useState(false);
  const [isLoadingMoreMedia, setIsLoadingMoreMedia] = useState(false);
  const [notifications, setNotifications] = useState<NDKEvent[]>([]);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [stats, setStats] = useState({
    followers: 0,
    zaps: 0,
    posts: 0,
  });
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediaModalType, setMediaModalType] = useState<'photo' | 'video'>('photo');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [blogEvents, setBlogEvents] = useState<NDKEvent[]>([]);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [currentMusicIndex, setCurrentMusicIndex] = useState(0);
  const [shouldAutoplayMusic, setShouldAutoplayMusic] = useState(false);
  const [streamEvents, setStreamEvents] = useState<NDKEvent[]>([]);
  const [viewMode, setViewMode] = useState<'feed' | 'media' | 'blog' | 'music' | 'streams'>('feed');
  const [isBlogModalOpen, setIsBlogModalOpen] = useState(false);
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({});
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);

  // Pagination State
  const [feedUntil, setFeedUntil] = useState<number | null>(null);
  const [mediaUntil, setMediaUntil] = useState<number | null>(null);
  const [hasMoreFeed, setHasMoreFeed] = useState(true);
  const [hasMoreMedia, setHasMoreMedia] = useState(true);
  const fetchingRef = useRef(false);

  const generateThumbnail = (videoUrl: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.src = videoUrl;
      video.muted = true;

      const cleanup = () => {
        video.remove();
      };

      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 5000);

      video.addEventListener('loadeddata', () => {
        const seekTime = Math.min(2, video.duration * 0.25);
        video.currentTime = seekTime;
      });

      video.addEventListener('seeked', () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 360;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
            clearTimeout(timeout);
            cleanup();
            resolve(thumbnailUrl);
          } else {
            clearTimeout(timeout);
            cleanup();
            resolve(null);
          }
        } catch (e) {
          clearTimeout(timeout);
          cleanup();
          resolve(null);
        }
      });

      video.addEventListener('error', () => {
        clearTimeout(timeout);
        cleanup();
        resolve(null);
      });

      video.load();
    });
  };

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

  const handleMusicSelect = (index: number) => {
    setCurrentMusicIndex(index);
    setShouldAutoplayMusic(true);
  };

  const getFollows = useCallback(async () => {
    if (!ndk || !user) return [];
    const activeUser = ndk.getUser({ pubkey: user.pubkey });
    const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
      ]);
    };

    const followedUsersSet = await withTimeout(
      activeUser.follows().catch(() => new Set<import('@nostr-dev-kit/ndk').NDKUser>()),
      3000,
      new Set<import('@nostr-dev-kit/ndk').NDKUser>()
    );
    const followPubkeys = Array.from(followedUsersSet || new Set()).map((u) => u.pubkey);
    if (!followPubkeys.includes(user.pubkey)) followPubkeys.push(user.pubkey);
    return followPubkeys;
  }, [ndk, user]);

  const loadMoreFeed = useCallback(async () => {
    if (!feedUntil || !ndk || isLoadingMoreFeed || !hasMoreFeed || fetchingRef.current) return;
    fetchingRef.current = true;
    setIsLoadingMoreFeed(true);
    try {
      const authors = await getFollows();
      const filter: NDKFilter = {
        kinds: [1],
        authors: authors,
        limit: 20,
        until: feedUntil,
      };
      const events = await ndk.fetchEvents(filter);
      const newEvents = Array.from(events).filter((e) => !e.tags.some((t) => t[0] === 'e'));

      if (newEvents.length === 0) {
        setHasMoreFeed(false);
        return;
      }

      setFeed((prev) => {
        const combined = [...prev, ...newEvents];
        const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values());
        return unique.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, 150);
      });

      const oldest = newEvents.sort((a, b) => (a.created_at || 0) - (b.created_at || 0))[0];
      if (oldest?.created_at) setFeedUntil(oldest.created_at - 1);
    } catch (e) {
      console.error('Error loading more feed:', e);
    } finally {
      setIsLoadingMoreFeed(false);
      fetchingRef.current = false;
    }
  }, [feedUntil, ndk, getFollows, isLoadingMoreFeed, hasMoreFeed]);

  const loadMoreMedia = useCallback(async () => {
    if (!mediaUntil || !ndk || isLoadingMoreMedia || !hasMoreMedia || fetchingRef.current) return;
    fetchingRef.current = true;
    setIsLoadingMoreMedia(true);
    try {
      const authors = await getFollows();
      const filter: NDKFilter = {
        kinds: [1, 1063],
        authors: authors,
        limit: 50,
        until: mediaUntil,
      };

      const events = await ndk.fetchEvents(filter);

      const processMediaEvent = (ev: NDKEvent): MediaItem | null => {
        if (ev.kind === 1063) {
          const url = ev.tags.find((t) => t[0] === 'url')?.[1];
          const mime = ev.tags.find((t) => t[0] === 'm')?.[1] || '';
          const thumb = ev.tags.find((t) => t[0] === 'thumb' || t[0] === 'image')?.[1];
          if (url) {
            return {
              id: ev.id,
              url,
              type: (mime.startsWith('video') ? 'video' : 'image') as 'image' | 'video',
              created_at: ev.created_at || 0,
              originalEvent: ev,
              thumb,
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
              type: 'image' as const,
              created_at: ev.created_at || 0,
              originalEvent: ev,
            };
          }
          const vidMatch = ev.content.match(videoRegex);
          if (vidMatch) {
            return {
              id: ev.id + '-vid',
              url: vidMatch[0],
              type: 'video' as const,
              created_at: ev.created_at || 0,
              originalEvent: ev,
            };
          }
        }
        return null;
      };

      const newItems = Array.from(events)
        .map(processMediaEvent)
        .filter((i): i is MediaItem => i !== null);

      if (newItems.length === 0) {
        setHasMoreMedia(false);
        return;
      }

      setMediaItems((prev) => {
        const combined = [...prev, ...newItems];
        const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values());
        return unique.sort((a, b) => b.created_at - a.created_at).slice(0, 150);
      });

      const oldest = newItems.sort((a, b) => a.created_at - b.created_at)[0];
      if (oldest?.created_at) setMediaUntil(oldest.created_at - 1);
    } catch (e) {
      console.error('Error loading more media:', e);
    } finally {
      setIsLoadingMoreMedia(false);
      fetchingRef.current = false;
    }
  }, [mediaUntil, ndk, getFollows, isLoadingMoreMedia, hasMoreMedia]);

  // Stats Fetching (Followers, Zaps, Posts)
  useEffect(() => {
    if (!ndk || !user) return;

    const fetchStats = async () => {
      try {
        // 1. Followers (People who follow the user - Kind 3 with #p tag)
        const followerFilter: NDKFilter = { kinds: [3], '#p': [user.pubkey] };
        const followers = await ndk.fetchEvents(followerFilter);

        // 2. Zaps (Kind 9735)
        const zapFilter: NDKFilter = { kinds: [9735], '#p': [user.pubkey] };
        const zapEvents = await ndk.fetchEvents(zapFilter);
        let totalZaps = 0;
        zapEvents.forEach((ev) => {
          const amountTag = ev.tags.find((t) => t[0] === 'amount');
          if (amountTag) {
            totalZaps += parseInt(amountTag[1]) / 1000; // millisats to sats
          } else {
            // NIP-57: Bolt11 description field might contain the amount if no tag
            const bolt11 = ev.tags.find((t) => t[0] === 'bolt11')?.[1];
            if (bolt11) {
              // Basic bolt11 amount extraction (very simplified)
              const match = bolt11.match(/lnbc(\d+)([pnum])1/);
              if (match) {
                let amt = parseInt(match[1]);
                const multiplier = match[2];
                if (multiplier === 'm') amt *= 100000;
                else if (multiplier === 'u') amt *= 100;
                else if (multiplier === 'n') amt *= 0.1;
                else if (multiplier === 'p') amt *= 0.0001;
                totalZaps += amt;
              }
            }
          }
        });

        // 3. Posts (Kind 1)
        const postFilter: NDKFilter = { kinds: [1], authors: [user.pubkey] };
        const posts = await ndk.fetchEvents(postFilter);

        setStats({
          followers: followers.size,
          zaps: Math.floor(totalZaps),
          posts: posts.size,
        });
      } catch (e) {
        console.error('Error fetching stats:', e);
      }
    };

    fetchStats();
    // Refresh stats every 5 minutes
    const interval = setInterval(fetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [ndk, user]);

  // Initial Feed Subscription
  useEffect(() => {
    if (!ndk || !user || viewMode !== 'feed') return;
    let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;
    const startFeedSub = async () => {
      if (feed.length === 0) setFeedLoading(true);
      const authors = await getFollows();
      const filter: NDKFilter = { kinds: [1, 6], authors: authors, limit: 30 };
      sub = ndk.subscribe(filter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
      });
      sub.on('event', (apiEvent: NDKEvent) => {
        if (apiEvent.kind === 1 && apiEvent.tags.some((t) => t[0] === 'e')) return;
        apiEvent.author.fetchProfile().catch(() => {});
        setFeed((prev) => {
          if (prev.find((e) => e.id === apiEvent.id)) return prev;
          const next = [apiEvent, ...prev].sort(
            (a, b) => (b.created_at || 0) - (a.created_at || 0)
          );
          return next.slice(0, 100);
        });
      });
      sub.on('eose', () => {
        setFeedLoading(false);
        setFeed((prev) => {
          if (prev.length > 0) {
            const oldest = prev[prev.length - 1];
            if (oldest.created_at) setFeedUntil(oldest.created_at - 1);
          }
          return prev;
        });
      });
    };
    startFeedSub();
    return () => {
      if (sub) sub.stop();
    };
  }, [ndk, user, viewMode, getFollows]);

  // Initial Media Subscription
  useEffect(() => {
    if (!ndk || !user || viewMode !== 'media') return;
    let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;
    const startMediaSub = async () => {
      if (mediaItems.length === 0) setMediaLoading(true);
      const authors = await getFollows();
      const filter: NDKFilter = { kinds: [1, 1063], authors: authors, limit: 50 };
      sub = ndk.subscribe(filter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
      });
      const processMediaEvent = (ev: NDKEvent): MediaItem | null => {
        if (ev.kind === 1063) {
          const url = ev.tags.find((t) => t[0] === 'url')?.[1];
          const mime = ev.tags.find((t) => t[0] === 'm')?.[1] || '';
          const thumb = ev.tags.find((t) => t[0] === 'thumb' || t[0] === 'image')?.[1];
          if (url) {
            return {
              id: ev.id,
              url,
              type: (mime.startsWith('video') ? 'video' : 'image') as 'image' | 'video',
              created_at: ev.created_at || 0,
              originalEvent: ev,
              thumb,
            };
          }
        } else if (ev.kind === 1) {
          const content = ev.content;
          const imgRegex = /(https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp))/i;
          const videoRegex = /(https?:\/\/\S+\.(?:mp4|mov|webm|avi|mkv|m3u8))/i;

          // Check for images first
          const imgMatch = content.match(imgRegex);
          if (imgMatch) {
            return {
              id: ev.id + '-img',
              url: imgMatch[0],
              type: 'image' as const,
              created_at: ev.created_at || 0,
              originalEvent: ev,
            };
          }

          // Helper to extract thumbnail from imeta tags and event tags
          const extractVideoThumb = (event: NDKEvent, videoUrl: string): string | undefined => {
            // Check thumb/image tags
            let thumb = event.getMatchingTags('thumb')[0]?.[1] || event.getMatchingTags('image')[0]?.[1];
            if (thumb) return thumb;

            // Check imeta tags for image URLs
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
                return tagUrl;
              }
            }

            // Fallback: extract any image URL from content that isn't the video URL
            const imgMatches = content.match(
              /https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif)(\?[^\s]*)?/gi
            );
            if (imgMatches) {
              return imgMatches.find((m) => m !== videoUrl);
            }

            return undefined;
          };

          // Check for direct video files
          const vidMatch = content.match(videoRegex);
          if (vidMatch) {
            return {
              id: ev.id + '-vid',
              url: vidMatch[0],
              type: 'video' as const,
              created_at: ev.created_at || 0,
              originalEvent: ev,
              thumb: extractVideoThumb(ev, vidMatch[0]),
            };
          }

          // Check for YouTube
          const youtubeMatch = content.match(
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/
          );
          if (youtubeMatch) {
            const videoId = youtubeMatch[1];
            return {
              id: ev.id + '-yt',
              url: `https://www.youtube.com/watch?v=${videoId}`,
              type: 'video' as const,
              created_at: ev.created_at || 0,
              originalEvent: ev,
              thumb: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            };
          }

          // Check for Vimeo
          const vimeoMatch = content.match(/vimeo\.com\/(\d+)/);
          if (vimeoMatch) {
            return {
              id: ev.id + '-vm',
              url: `https://vimeo.com/${vimeoMatch[1]}`,
              type: 'video' as const,
              created_at: ev.created_at || 0,
              originalEvent: ev,
              thumb: extractVideoThumb(ev, `https://vimeo.com/${vimeoMatch[1]}`),
            };
          }

          // Check for Streamable
          const streamableMatch = content.match(/streamable\.com\/([a-zA-Z0-9]+)/);
          if (streamableMatch) {
            return {
              id: ev.id + '-st',
              url: `https://streamable.com/${streamableMatch[1]}`,
              type: 'video' as const,
              created_at: ev.created_at || 0,
              originalEvent: ev,
              thumb: extractVideoThumb(ev, `https://streamable.com/${streamableMatch[1]}`),
            };
          }
        }
        return null;
      };
      sub.on('event', (ev: NDKEvent) => {
        const newItem = processMediaEvent(ev);
        if (newItem) {
          ev.author.fetchProfile().catch(() => {});
          setMediaItems((prev) => {
            if (prev.find((i) => i.id === newItem.id)) return prev;
            const next = [newItem, ...prev].sort((a, b) => b.created_at - a.created_at);
            return next.slice(0, 100);
          });

          // Generate thumbnail for direct video files if none exists
          if (newItem.type === 'video' && !newItem.thumb && !newItem.url.includes('youtube') && !newItem.url.includes('vimeo') && !newItem.url.includes('streamable')) {
            if (thumbnailCache[newItem.url]) {
              setMediaItems((prev) =>
                prev.map((i) => (i.id === newItem.id ? { ...i, thumb: thumbnailCache[newItem.url] } : i))
              );
            } else {
              generateThumbnail(newItem.url).then((generatedThumb) => {
                if (generatedThumb) {
                  setThumbnailCache((prev) => ({ ...prev, [newItem.url]: generatedThumb }));
                  setMediaItems((prev) =>
                    prev.map((i) => (i.id === newItem.id ? { ...i, thumb: generatedThumb } : i))
                  );
                }
              });
            }
          }
        }
      });
      sub.on('eose', () => {
        setMediaLoading(false);
        setMediaItems((prev) => {
          if (prev.length > 0) {
            const oldest = prev[prev.length - 1];
            if (oldest.created_at) setMediaUntil(oldest.created_at - 1);
          }
          return prev;
        });
      });
    };
    startMediaSub();
    return () => {
      if (sub) sub.stop();
    };
  }, [ndk, user, viewMode, getFollows]);

  // Blogs and Streams
  useEffect(() => {
    if (!ndk || !user || (viewMode !== 'blog' && viewMode !== 'streams')) return;
    let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;
    const start = async () => {
      const authors = await getFollows();
      const kind = viewMode === 'blog' ? [30023] : [30311];
      sub = ndk.subscribe({ kinds: kind, authors, limit: 20 }, { closeOnEose: false });
      sub.on('event', (ev) => {
        if (viewMode === 'blog') {
          setBlogEvents((prev) => {
            if (prev.find((e) => e.id === ev.id)) return prev;
            return [...prev, ev].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          });
        } else if (viewMode === 'streams') {
          setStreamEvents((prev) => {
            if (prev.find((e) => e.id === ev.id)) return prev;
            return [...prev, ev].sort((a, b) => {
              const aStatus = a.tags.find((t) => t[0] === 'status')?.[1] || 'ended';
              const bStatus = b.tags.find((t) => t[0] === 'status')?.[1] || 'ended';
              if (aStatus === 'live' && bStatus !== 'live') return -1;
              if (bStatus === 'live' && aStatus !== 'live') return 1;
              return (b.created_at || 0) - (a.created_at || 0);
            });
          });
        }
      });
    };
    start();
    return () => {
      if (sub) sub.stop();
    };
  }, [ndk, user, viewMode, getFollows]);

  // Music
  useEffect(() => {
    if (!ndk || viewMode !== 'music') return;
    setMusicLoading(true);
    const filter: NDKFilter = { kinds: [31337 as import('@nostr-dev-kit/ndk').NDKKind], limit: 20 };
    ndk.fetchEvents(filter).then((events) => {
      const tracks: MusicTrack[] = Array.from(events)
        .map((ev) => {
          const title = ev.tags.find((t) => t[0] === 'title')?.[1] || 'Unknown';
          const artist = ev.tags.find((t) => t[0] === 'artist')?.[1] || 'Unknown';
          const url = ev.tags.find((t) => t[0] === 'url')?.[1] || '';
          const link = ev.tags.find((t) => t[0] === 'link')?.[1] || '';
          const albumArtUrl = ev.tags.find((t) => t[0] === 'image')?.[1];
          return { title, artist, url, link, albumArtUrl };
        })
        .filter((t) => t.url);
      setMusicTracks(tracks);
      setMusicLoading(false);
    });
  }, [ndk, viewMode]);

  useEffect(() => {
    if (!ndk || !user) return;
    let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;

    const startNotificationSub = async () => {
      const filter: NDKFilter = {
        kinds: [1, 6, 7, 9735],
        '#p': [user.pubkey],
        limit: 50,
      };

      sub = ndk.subscribe(filter, { closeOnEose: false });

      sub.on('event', (ev: NDKEvent) => {
        setNotifications((prev) => {
          if (prev.find((e) => e.id === ev.id)) return prev;
          const next = [ev, ...prev].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          return next.slice(0, 50);
        });
        // Pre-fetch author profile for the notification
        ev.author.fetchProfile().catch(() => {});
      });
    };

    startNotificationSub();
    return () => {
      if (sub) sub.stop();
    };
  }, [ndk, user]);

  // Stats effect removed from here and moved up to be more comprehensive and autonomous

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
            <Link to="/edit-layout" className="page-themes-link">
              <div className="theme-icon"></div>
              Choose Theme
            </Link>
          </div>
          <div className="home-header-sub">
            <div className="my-url-text">
              My URL:{' '}
              <Link to={`/p/${user?.pubkey}`}>http://mynostrspace.com/p/{user?.pubkey}</Link>
            </div>
            <Link to="/edit-profile" className="edit-profile-link">
              Edit Profile
            </Link>
          </div>

          <div className="home-layout">
            {/* Left Sidebar */}
            <div className="home-left">
              <div className="home-box user-pic-box">
                <div className="home-box-body">
                  <Link to={`/p/${user?.pubkey}`}>
                    <Avatar
                      pubkey={user?.pubkey}
                      src={user?.profile?.image}
                      size={170}
                      className="user-pic"
                    />
                  </Link>
                  <ul className="profile-stats">
                    <li>
                      <b>{stats.followers}</b> Followers
                    </li>
                    <li>
                      <b>{stats.zaps}</b> Zaps
                    </li>
                    <li>
                      <b>{stats.posts}</b> Posts
                    </li>
                  </ul>
                  {user?.profile?.about && (
                    <div
                      className="user-bio"
                      style={{
                        fontSize: '9pt',
                        marginTop: '10px',
                        color: '#444',
                        borderTop: '1px solid #ddd',
                        paddingTop: '10px',
                        whiteSpace: 'pre-wrap',
                        lineHeight: '1.4',
                      }}
                    >
                      {user.profile.about}
                    </div>
                  )}
                  <ul className="quick-links">
                    <li>
                      <Link to={`/p/${user?.pubkey}`}>View My Profile</Link>
                    </li>
                    <li>
                      <Link to="/edit-profile">Edit My Profile</Link>
                    </li>
                    <li>
                      <Link to="/settings">Account Settings</Link>
                    </li>
                    <li>
                      <Link to="/edit-layout">Edit Theme</Link>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="home-box">
                <div className="home-box-header">My Apps</div>
                <div className="home-box-body">
                  <ul className="my-apps-list">
                    <li className="app-item" onClick={() => navigate('/blogs')}>
                      <span className="app-icon">✍️</span> Blogs
                    </li>
                    <li className="app-item" onClick={() => navigate('/videos')}>
                      <span className="app-icon">🎥</span> Videos
                    </li>
                    <li className="app-item" onClick={() => navigate('/marketplace')}>
                      <span className="app-icon">🛒</span> Shop
                    </li>
                    <li className="app-item" onClick={() => navigate('/music')}>
                      <span className="app-icon">🎵</span> Music
                    </li>
                  </ul>
                </div>
              </div>

              <div className="home-box">
                <div className="home-box-header">Notifications</div>
                <div className="home-box-body" style={{ padding: 0 }}>
                  <div className="notifications-list">
                    {notifications.length === 0 && (
                      <div style={{ padding: '10px', fontSize: '8pt', textAlign: 'center' }}>
                        No notifications yet.
                      </div>
                    )}
                    {notifications.slice(0, showAllNotifications ? undefined : 5).map((n) => {
                      const authorName =
                        n.author.profile?.name ||
                        n.author.profile?.displayName ||
                        n.pubkey.slice(0, 8);
                      const type =
                        n.kind === 1
                          ? 'replied'
                          : n.kind === 7
                            ? 'liked'
                            : n.kind === 9735
                              ? 'zapped'
                              : n.kind === 6
                                ? 'reposted'
                                : 'interacted';

                      // Determine link for the notification
                      let link = `/p/${n.pubkey}`;
                      if (n.kind === 1 || n.kind === 7 || n.kind === 6) {
                        const targetId = n.tags.find((t) => t[0] === 'e')?.[1] || n.id;
                        link = `/thread/${targetId}`;
                      } else if (n.kind === 9735) {
                        const targetId = n.tags.find((t) => t[0] === 'e')?.[1];
                        if (targetId) link = `/thread/${targetId}`;
                      }

                      return (
                        <div
                          key={n.id}
                          className="notification-item clickable"
                          onClick={() => navigate(link)}
                        >
                          <Avatar
                            pubkey={n.pubkey}
                            src={n.author.profile?.image}
                            size={24}
                            className="notification-user-pic"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/p/${n.pubkey}`);
                            }}
                          />
                          <div className="notification-content">
                            <Link
                              to={`/p/${n.pubkey}`}
                              className="notification-user-name"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {authorName}
                            </Link>
                            <span className="notification-action"> {type} your post</span>
                            <div className="notification-time">
                              {new Date((n.created_at || 0) * 1000).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {notifications.length > 5 && (
                    <div
                      style={{ padding: '5px', textAlign: 'center', borderTop: '1px solid #ccc' }}
                    >
                      <button
                        onClick={() => setShowAllNotifications(!showAllNotifications)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#003399',
                          cursor: 'pointer',
                          fontSize: '8pt',
                          fontWeight: 'bold',
                        }}
                      >
                        {showAllNotifications ? 'Show Less' : `View All (${notifications.length})`}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="home-main">
              <div className="home-box status-mood-box">
                <div className="status-mood-header">Status & Mood</div>
                <div className="status-input-container">
                  <textarea
                    className="status-input nostr-input"
                    placeholder="Update your status..."
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
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
                  Live
                </button>
              </div>

              <div
                className="tab-content"
                style={{
                  background: 'white',
                  border: '1px solid #6699cc',
                  borderTop: 'none',
                  minHeight: '400px',
                }}
              >
                {viewMode === 'feed' && (
                  <div className="feed-container">
                    {feedLoading && feed.length === 0 && (
                      <div style={{ padding: '20px' }}>Loading Feed...</div>
                    )}
                    {feed.map((event) => (
                      <FeedItem key={event.id} event={event} />
                    ))}
                    {hasMoreFeed && feed.length > 0 && (
                      <div style={{ padding: '15px', textAlign: 'center' }}>
                        <button
                          className="post-status-btn"
                          onClick={loadMoreFeed}
                          disabled={isLoadingMoreFeed}
                        >
                          {isLoadingMoreFeed ? 'Loading...' : 'Load More Posts'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {viewMode === 'media' && (
                  <div className="media-gallery">
                    {mediaLoading && mediaItems.length === 0 && (
                      <div style={{ padding: '20px' }}>Loading Media...</div>
                    )}
                    {mediaItems.map((item) => {
                      const ytMatch = item.url.match(
                        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/
                      );
                      const isExpanded = expandedVideoId === item.id;
                      return (
                        <div key={item.id} className="gallery-item">
                          {item.type === 'image' ? (
                            <img src={item.url} alt="" loading="lazy" />
                          ) : isExpanded ? (
                            ytMatch ? (
                              <iframe
                                src={`https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`}
                                title="YouTube video"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                style={{ width: '100%', height: '100%', border: 'none' }}
                              />
                            ) : (
                              <video src={item.url} controls autoPlay preload="metadata" />
                            )
                          ) : (
                            <div
                              className="gallery-video-thumb"
                              onClick={() => setExpandedVideoId(item.id)}
                            >
                              {item.thumb ? (
                                <img src={item.thumb} alt="" loading="lazy" />
                              ) : (
                                <div className="gallery-video-placeholder" />
                              )}
                              <div className="gallery-play-overlay">
                                <span className="gallery-play-icon">▶</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {hasMoreMedia && mediaItems.length > 0 && (
                      <div style={{ padding: '15px', textAlign: 'center', gridColumn: '1 / -1' }}>
                        <button
                          className="post-status-btn"
                          onClick={loadMoreMedia}
                          disabled={isLoadingMoreMedia}
                        >
                          {isLoadingMoreMedia ? 'Loading...' : 'Load More Media'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {viewMode === 'blog' && (
                  <div className="blog-gallery">
                    {blogEvents.map((ev) => (
                      <div key={ev.id} className="blog-entry-card">
                        <div className="blog-entry-content">
                          <Link
                            to={`/blog/${ev.pubkey}/${ev.getMatchingTags('d')[0]?.[1]}`}
                            className="blog-entry-title"
                          >
                            {ev.getMatchingTags('title')[0]?.[1] || 'Untitled'}
                          </Link>
                          <p className="blog-entry-summary">{ev.content.slice(0, 150)}...</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {viewMode === 'music' && (
                  <div className="music-tab" style={{ padding: '10px' }}>
                    {musicLoading && <div>Loading Music...</div>}
                    {musicTracks.length > 0 && (
                      <WavlakePlayer
                        tracks={musicTracks}
                        currentTrackIndex={currentMusicIndex}
                        onTrackSelect={handleMusicSelect}
                        autoplay={shouldAutoplayMusic}
                      />
                    )}
                  </div>
                )}

                {viewMode === 'streams' && (
                  <div style={{ padding: '15px' }}>
                    {streamEvents.map((ev) => (
                      <div key={ev.id} style={{ marginBottom: '10px' }}>
                        <Link
                          to={`/stream/${ev.pubkey}/${ev.getMatchingTags('d')[0]?.[1]}`}
                          style={{ color: '#003399', fontWeight: 'bold' }}
                        >
                          {ev.tags.find((t) => t[0] === 'title')?.[1] || 'Live Stream'}
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
        onPostComplete={() => {}}
      />
    </div>
  );
};

export default HomePage;

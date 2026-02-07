import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import {
  NDKEvent,
  type NDKFilter,
  NDKSubscriptionCacheUsage,
  NDKRelaySet,
} from '@nostr-dev-kit/ndk';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { Navbar } from '../Shared/Navbar';
import { FeedItem } from '../Shared/FeedItem';
import { SEO } from '../Shared/SEO';
import { MediaUpload } from './MediaUpload';
import { BlogEditor } from './BlogEditor';
import { WavlakePlayer } from '../Music/WavlakePlayer';
import { Avatar } from '../Shared/Avatar';
import { VideoThumbnail } from '../Shared/VideoThumbnail';
import { Virtuoso } from 'react-virtuoso';
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

  const fetchStats = async () => {
    if (loadingStats || !ndk || !user?.pubkey) return;
    setLoadingStats(true);

    // Reset stats to 0 to start counting up
    setStats({ followers: 0, posts: 0, zaps: 0 });

    try {
      // 1. Get User's Preferred Relays (Kind 10002)
      const relayEvent = await ndk.fetchEvent({ kinds: [10002], authors: [user.pubkey] });
      const relayUrls = relayEvent
        ? relayEvent.tags.filter((t) => t[0] === 'r').map((t) => t[1])
        : [];

      const targetRelays =
        relayUrls.length > 0 ? NDKRelaySet.fromRelayUrls(relayUrls, ndk) : undefined;

      // 2. Start Subscriptions (Streaming)
      const followersSub = ndk.subscribe(
        { kinds: [3], '#p': [user.pubkey] },
        { closeOnEose: true, relaySet: targetRelays }
      );

      const postsSub = ndk.subscribe(
        { kinds: [1], authors: [user.pubkey] },
        { closeOnEose: true, relaySet: targetRelays }
      );

      const zapsSub = ndk.subscribe(
        { kinds: [9735], '#p': [user.pubkey] },
        { closeOnEose: true, relaySet: targetRelays }
      );

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
      setTimeout(() => setLoadingStats(false), 15000);
    } catch (e) {
      console.error('Error starting stats stream:', e);
      setLoadingStats(false);
    }
  };

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
  // Pagination State
  const [feedUntil, setFeedUntil] = useState<number | null>(null);
  const [mediaUntil, setMediaUntil] = useState<number | null>(null);
  const [hasMoreFeed, setHasMoreFeed] = useState(true);
  const [hasMoreMedia, setHasMoreMedia] = useState(true);
  const fetchingRef = useRef(false);
  const feedEoseRef = useRef(false);
  const eoseTimestampRef = useRef(0);
  const followsCacheRef = useRef<string[]>([]);
  const followsFetchedRef = useRef(false);
  const [pendingPosts, setPendingPosts] = useState<NDKEvent[]>([]);
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);
  const [displayedFeedCount, setDisplayedFeedCount] = useState(20);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const [displayedStreamsCount, setDisplayedStreamsCount] = useState(15);
  const loadMoreStreamsTriggerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(3);

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

  // Helper to dedupe and sort feed events (used by flushBuffer and pending posts)
  const dedupAndSortFeed = (
    newEvents: NDKEvent[],
    existingEvents: NDKEvent[]
  ): NDKEvent[] => {
    const combined = [...newEvents, ...existingEvents];
    const unique = Array.from(
      new Map(combined.map((item) => [item.id, item])).values()
    );
    return unique
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      .slice(0, 100);
  };

  const getCanonicalUrl = (url: string) => {
    try {
      const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
      if (ytMatch) return `https://www.youtube.com/watch?v=${ytMatch[1]}`;
      return url;
    } catch {
      return url;
    }
  };

  const processMediaEvent = useCallback((ev: NDKEvent): MediaItem | null => {
    // Fast path for Kind 1063 - URL is in tags, no regex needed
    if (ev.kind === 1063) {
      const url = ev.tags.find((t) => t[0] === 'url')?.[1];
      if (!url) return null; // Early return if no URL

      const mime = ev.tags.find((t) => t[0] === 'm')?.[1] || '';
      const thumb = ev.tags.find((t) => t[0] === 'thumb' || t[0] === 'image')?.[1];
      return {
        id: ev.id,
        url,
        type: (mime.startsWith('video') ? 'video' : 'image') as 'image' | 'video',
        created_at: ev.created_at || 0,
        originalEvent: ev,
        thumb,
      };
    }

    if (ev.kind === 1) {
      const content = ev.content;

      // Early return for empty or very short content
      if (!content || content.length < 10) return null;

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
        const thumb =
          event.getMatchingTags('thumb')[0]?.[1] || event.getMatchingTags('image')[0]?.[1];
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
        const imgMatches = content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif)(\?[^\s]*)?/gi);
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
      const youtubeMatch = content.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
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
  }, []);

  const addMediaItems = useCallback((newItems: MediaItem[]) => {
    if (newItems.length === 0) return;
    setMediaItems((prev) => {
      const seenUrls = new Set<string>();
      const result: MediaItem[] = [];

      // Keep existing items first
      for (const item of prev) {
        const canonical = getCanonicalUrl(item.url);
        if (!seenUrls.has(canonical)) {
          seenUrls.add(canonical);
          result.push(item);
        }
      }

      // Add new items
      for (const item of newItems) {
        const canonical = getCanonicalUrl(item.url);
        if (!seenUrls.has(canonical)) {
          seenUrls.add(canonical);
          result.push(item);
        }
      }

      return result.sort((a, b) => b.created_at - a.created_at).slice(0, 150);
    });
  }, []);

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

    // Return cached immediately if available for instant load
    if (followsFetchedRef.current && followsCacheRef.current.length > 0) {
      return followsCacheRef.current;
    }

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

    // Cache the result
    followsCacheRef.current = followPubkeys;
    followsFetchedRef.current = true;

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

      const newItems = Array.from(events)
        .map(processMediaEvent)
        .filter((i): i is MediaItem => i !== null);

      if (newItems.length === 0) {
        setHasMoreMedia(false);
        return;
      }

      addMediaItems(newItems);

      const oldest = newItems.sort((a, b) => a.created_at - b.created_at)[0];
      if (oldest?.created_at) setMediaUntil(oldest.created_at - 1);
    } catch (e) {
      console.error('Error loading more media:', e);
    } finally {
      setIsLoadingMoreMedia(false);
      fetchingRef.current = false;
    }
  }, [mediaUntil, ndk, getFollows, isLoadingMoreMedia, hasMoreMedia]);

  // Initial Feed Subscription
  useEffect(() => {
    if (!ndk || !user || viewMode !== 'feed') return;
    feedEoseRef.current = false;
    setPendingPosts([]);
    setDisplayedFeedCount(20); // Reset to initial display count
    let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;
    const startFeedSub = async () => {
      if (feed.length === 0) setFeedLoading(true);
      const authors = await getFollows();
      const filter: NDKFilter = { kinds: [1, 6], authors: authors, limit: 25 };
      sub = ndk.subscribe(filter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
      });

      let eventBuffer: NDKEvent[] = [];
      let flushTimeout: ReturnType<typeof setTimeout> | null = null;

      const flushBuffer = () => {
        if (eventBuffer.length === 0) return;
        const currentBuffer = [...eventBuffer];
        eventBuffer = [];

        // Use functional setState - React batches these efficiently
        setFeed((prev) => dedupAndSortFeed(currentBuffer, prev));
      };

      let mediaEventBuffer: MediaItem[] = [];
      let mediaFlushTimeout: ReturnType<typeof setTimeout> | null = null;
      const flushMediaBuffer = () => {
        if (mediaEventBuffer.length === 0) return;
        const currentMBuffer = [...mediaEventBuffer];
        mediaEventBuffer = [];
        addMediaItems(currentMBuffer);
      };

      sub.on('event', (apiEvent: NDKEvent) => {
        // 1. Process for media (Feed -> Media Integration)
        const mediaItem = processMediaEvent(apiEvent);
        if (mediaItem) {
          mediaEventBuffer.push(mediaItem);
          if (!mediaFlushTimeout) {
            mediaFlushTimeout = setTimeout(() => {
              flushMediaBuffer();
              mediaFlushTimeout = null;
            }, 500);
          }
        }

        if (apiEvent.kind === 1 && apiEvent.tags.some((t) => t[0] === 'e')) return;

        const isNewPost =
          feedEoseRef.current && (apiEvent.created_at || 0) > eoseTimestampRef.current;

        if (isNewPost) {
          setPendingPosts((prev) => {
            if (prev.find((e) => e.id === apiEvent.id)) return prev;
            return [apiEvent, ...prev].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          });
        } else {
          eventBuffer.push(apiEvent);
          if (!flushTimeout) {
            flushTimeout = setTimeout(() => {
              flushBuffer();
              flushTimeout = null;
            }, 300); // Batch updates every 300ms
          }
        }
      });
      sub.on('eose', () => {
        flushBuffer();
        setFeedLoading(false);
        feedEoseRef.current = true;
        eoseTimestampRef.current = Math.floor(Date.now() / 1000);
        setFeed((prev) => {
          if (prev.length > 0) {
            const oldest = prev[prev.length - 1];
            if (oldest.created_at) setFeedUntil(oldest.created_at - 1);

            // Batch pre-fetch profiles for visible authors (fire-and-forget)
            const uniqueAuthors = [...new Set(prev.slice(0, 20).map((e) => e.pubkey))];
            Promise.all(
              uniqueAuthors.map((pk) =>
                ndk?.getUser({ pubkey: pk }).fetchProfile({
                  cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
                }).catch(() => { })
              )
            );
          }
          return prev;
        });
      });
    };
    startFeedSub();
    return () => {
      if (sub) sub.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      /* Removed redundant logic */

      let mBuffer: MediaItem[] = [];
      let mFlushTimeout: ReturnType<typeof setTimeout> | null = null;

      const flushMBuffer = () => {
        if (mBuffer.length === 0) return;
        const currentBuffer = [...mBuffer];
        mBuffer = [];
        addMediaItems(currentBuffer);
      };

      sub.on('event', (ev: NDKEvent) => {
        const newItem = processMediaEvent(ev);
        if (newItem) {
          mBuffer.push(newItem);
          if (!mFlushTimeout) {
            mFlushTimeout = setTimeout(() => {
              flushMBuffer();
              mFlushTimeout = null;
            }, 400);
          }
        }
      });
      sub.on('eose', () => {
        flushMBuffer();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Batch notifications to avoid excessive re-renders
      let notifBuffer: NDKEvent[] = [];
      let notifFlushTimeout: ReturnType<typeof setTimeout> | null = null;

      const flushNotifications = () => {
        if (notifBuffer.length === 0) return;
        const buffer = [...notifBuffer];
        notifBuffer = [];

        // Batch fetch profiles for notification authors
        const uniqueAuthors = [...new Set(buffer.map((e) => e.pubkey))];
        uniqueAuthors.forEach((pk) => {
          ndk.getUser({ pubkey: pk }).fetchProfile({
            cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
          }).catch(() => {});
        });

        setNotifications((prev) => {
          const combined = [...buffer, ...prev];
          const unique = Array.from(
            new Map(combined.map((item) => [item.id, item])).values()
          );
          return unique
            .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
            .slice(0, 50);
        });
      };

      sub.on('event', (ev: NDKEvent) => {
        notifBuffer.push(ev);
        if (!notifFlushTimeout) {
          notifFlushTimeout = setTimeout(() => {
            flushNotifications();
            notifFlushTimeout = null;
          }, 300);
        }
      });

      sub.on('eose', flushNotifications);
    };

    startNotificationSub();
    return () => {
      if (sub) sub.stop();
    };
  }, [ndk, user]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (viewMode !== 'feed') return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting) {
          // Debounce to prevent rapid state updates during scroll
          if (debounceTimer) clearTimeout(debounceTimer);

          debounceTimer = setTimeout(() => {
            // Load more displayed items from existing feed
            if (displayedFeedCount < feed.length) {
              setDisplayedFeedCount((prev) => Math.min(prev + 20, feed.length));
            }
            // If we've displayed all items and there's more to fetch
            else if (hasMoreFeed && !isLoadingMoreFeed) {
              loadMoreFeed();
            }
          }, 150); // 150ms debounce
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      observer.disconnect();
    };
  }, [viewMode, displayedFeedCount, feed.length, hasMoreFeed, isLoadingMoreFeed, loadMoreFeed]);

  // Reset displayed count when feed changes significantly
  useEffect(() => {
    if (viewMode === 'feed' && feed.length > 0) {
      setDisplayedFeedCount((prev) => Math.min(prev, Math.max(20, feed.length)));
    }
  }, [viewMode, feed.length]);

  // Intersection Observer for streams infinite scroll
  useEffect(() => {
    if (viewMode !== 'streams') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && displayedStreamsCount < streamEvents.length) {
          setDisplayedStreamsCount((prev) => Math.min(prev + 15, streamEvents.length));
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (loadMoreStreamsTriggerRef.current) {
      observer.observe(loadMoreStreamsTriggerRef.current);
    }

    return () => observer.disconnect();
  }, [viewMode, displayedStreamsCount, streamEvents.length]);

  // Reset displayed streams count when switching to streams view
  useEffect(() => {
    if (viewMode === 'streams') {
      setDisplayedStreamsCount(15);
    }
  }, [viewMode]);

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
              My URL: <Link to={`/p/${user?.npub}`}>http://mynostrspace.com/p/{user?.npub}</Link>
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
                  <Link to={`/p/${user?.npub}`}>
                    <Avatar
                      pubkey={user?.pubkey}
                      src={user?.profile?.image}
                      size={170}
                      className="user-pic"
                    />
                  </Link>
                  <div
                    className="profile-stats-clickable"
                    onClick={fetchStats}
                    title="Click to load stats"
                  >
                    {loadingStats ? (
                      <span>Loading...</span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span>Followers: {stats.followers ?? '∞'}</span>
                        <span>Posts: {stats.posts ?? '∞'}</span>
                        <span>Zaps Recv: {stats.zaps ?? '∞'} 丰</span>
                      </div>
                    )}
                  </div>

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
                      <Link to={`/p/${user?.npub}`}>View My Profile</Link>
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
                    onChange={(e) => {
                      setStatus(e.target.value);
                      const el = e.target;
                      el.style.height = 'auto';
                      el.style.height = Math.min(el.scrollHeight, 80) + 'px';
                    }}
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
                    {pendingPosts.length > 0 && (
                      <div
                        className="new-posts-banner"
                        onClick={() => {
                          const sorted = dedupAndSortFeed(pendingPosts, feed);
                          setFeed(sorted);
                          setPendingPosts([]);
                        }}
                      >
                        {pendingPosts.length} new post{pendingPosts.length !== 1 ? 's' : ''} — click
                        to show
                      </div>
                    )}
                    <Virtuoso
                      data={feed.slice(0, displayedFeedCount)}
                      overscan={200}
                      increaseViewportBy={{ top: 1000, bottom: 500 }}
                      useWindowScroll
                      itemContent={(_index, event) => (
                        <FeedItem key={event.id} event={event} />
                      )}
                      endReached={() => {
                        if (feed.length > displayedFeedCount) {
                          setDisplayedFeedCount((c) => c + 15);
                        } else if (hasMoreFeed && !isLoadingMoreFeed) {
                          loadMoreFeed();
                        }
                      }}
                    />
                    {isLoadingMoreFeed && (
                      <div style={{ padding: '15px', textAlign: 'center' }}>
                        Loading more posts...
                      </div>
                    )}
                  </div>
                )}

                {viewMode === 'media' && (
                  <div style={{ background: 'white' }}>
                    <div className="media-gallery" style={{ paddingBottom: 0 }}>
                      {mediaLoading && mediaItems.length === 0 && (
                        <div style={{ padding: '20px', width: '100%' }}>Loading Media...</div>
                      )}
                      {(() => {
                        const columns: MediaItem[][] = Array.from(
                          { length: columnCount },
                          () => []
                        );
                        mediaItems.forEach((item, index) => {
                          columns[index % columnCount].push(item);
                        });

                        return columns.map((colItems, colIndex) => (
                          <div key={colIndex} className="media-gallery-column">
                            {colItems.map((item) => {
                              const ytMatch = item.url.match(
                                /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/
                              );
                              const vimeoMatch = item.url.match(/vimeo\.com\/(\d+)/);
                              const streamableMatch = item.url.match(
                                /streamable\.com\/([a-zA-Z0-9]+)/
                              );
                              const isExpanded = expandedVideoId === item.id;

                              return (
                                <div
                                  key={item.id}
                                  className="gallery-item"
                                  style={{ aspectRatio: isExpanded ? '16/9' : 'auto' }}
                                >
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
                                    ) : vimeoMatch ? (
                                      <iframe
                                        src={`https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`}
                                        title="Vimeo video"
                                        frameBorder="0"
                                        allow="autoplay; fullscreen; picture-in-picture"
                                        allowFullScreen
                                        style={{ width: '100%', height: '100%', border: 'none' }}
                                      />
                                    ) : streamableMatch ? (
                                      <iframe
                                        src={`https://streamable.com/e/${streamableMatch[1]}?autoplay=1`}
                                        title="Streamable video"
                                        frameBorder="0"
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
                                        <VideoThumbnail src={item.url} />
                                      )}
                                      <div className="gallery-play-overlay">
                                        {ytMatch ? (
                                          <div className="youtube-symbol" title="YouTube" />
                                        ) : (
                                          <span className="gallery-play-icon">▶</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ));
                      })()}
                    </div>
                    {hasMoreMedia && mediaItems.length > 0 && (
                      <div style={{ padding: '15px', textAlign: 'center' }}>
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
                    {streamEvents.slice(0, displayedStreamsCount).map((ev) => (
                      <div key={ev.id} className="stream-item">
                        <Link to={`/stream/${ev.pubkey}/${ev.getMatchingTags('d')[0]?.[1]}`}>
                          {ev.tags.find((t) => t[0] === 'title')?.[1] || 'Live Stream'}
                        </Link>
                      </div>
                    ))}
                    {/* Intersection observer trigger for streams */}
                    <div
                      ref={loadMoreStreamsTriggerRef}
                      style={{ height: '20px', margin: '10px 0' }}
                    />
                    {displayedStreamsCount < streamEvents.length && (
                      <div
                        style={{
                          padding: '10px',
                          textAlign: 'center',
                          color: '#666',
                          fontSize: '14px',
                        }}
                      >
                        Showing {displayedStreamsCount} of {streamEvents.length} streams
                      </div>
                    )}
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
        onPostComplete={() => { }}
      />
    </div>
  );
};

export default HomePage;

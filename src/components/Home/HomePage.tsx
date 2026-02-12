import { useEffect, useState, useCallback, useRef, memo, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import {
  NDKEvent,
  type NDKFilter,
  NDKSubscriptionCacheUsage,
  NDKRelaySet,
} from '@nostr-dev-kit/ndk';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { filterRelays } from '../../utils/relay';
import { Navbar } from '../Shared/Navbar';
import { FeedItem } from '../Shared/FeedItem';
import { SEO } from '../Shared/SEO';
import { MediaUpload } from './MediaUpload';
import { BlogEditor } from './BlogEditor';

import { Avatar } from '../Shared/Avatar';
import { VideoThumbnail } from '../Shared/VideoThumbnail';
import { useNotifications } from '../../context/NotificationContext';
import { useProfile } from '../../hooks/useProfile';
import { useBlockList } from '../../hooks/useBlockList';
import { MentionInput } from '../Shared/MentionInput';
import { extractMentions } from '../../utils/mentions';
import { EmbeddedNote } from '../Shared/EmbeddedNote';

import './HomePage.css';

// Single notification item - shows who did what to your post
const NotificationItem = memo(
  ({ event, onClick }: { event: NDKEvent; onClick: (link: string) => void }) => {
    const { profile } = useProfile(event.pubkey);

    const authorName = profile?.name || profile?.displayName || event.pubkey.slice(0, 8);
    const targetId = event.tags.find((t) => t[0] === 'e')?.[1];

    // Determine action text
    let actionText = '';
    let actionIcon = '';
    if (event.kind === 7) {
      actionIcon = '♥';
      actionText = 'liked your post';
    } else if (event.kind === 6) {
      actionIcon = '↻';
      actionText = 'reposted your post';
    } else if (event.kind === 1) {
      actionIcon = '💬';
      actionText = 'replied to your post';
    } else if (event.kind === 9735) {
      actionIcon = '⚡';
      actionText = 'zapped your post';
    }


    return (
      <div
        className="notification-item clickable"
        onClick={() => {
          if (event.kind === 1) {
            // For replies, navigate to the reply itself so ThreadPage
            // resolves the full thread and highlights this reply
            onClick(`/thread/${event.id}`);
          } else if (targetId) {
            onClick(`/thread/${targetId}`);
          }
        }}
      >
        <Avatar pubkey={event.pubkey} src={profile?.picture} size={36} />
        <div className="notification-content">
          <div className="notification-action-line">
            <span className="notification-icon">{actionIcon}</span>
            <Link
              to={`/p/${event.pubkey}`}
              className="notification-user-name"
              onClick={(e) => e.stopPropagation()}
            >
              {authorName}
            </Link>
            <span className="notification-action"> {actionText}</span>
          </div>

          {/* Show brief reply preview if it's a reply */}
          {event.kind === 1 && event.content && (
            <div className="notification-reply-preview">
              {event.content.slice(0, 100)}
              {event.content.length > 100 && '...'}
            </div>
          )}

          <div className="notification-time">
            {new Date((event.created_at || 0) * 1000).toLocaleString()}
          </div>
        </div>
      </div>
    );
  }
);



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

  const [status, setStatus] = useState('');
  const [mood, setMood] = useState('None');
  const [isLoadingMoreFeed, setIsLoadingMoreFeed] = useState(false);
  const [isLoadingMoreMedia, setIsLoadingMoreMedia] = useState(false);
  const [isLoadingMoreReplies, setIsLoadingMoreReplies] = useState(false);
  const [isRepliesLoading, setIsRepliesLoading] = useState(false);
  const [notifications, setNotifications] = useState<NDKEvent[]>([]);
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
      const userRelays = relayEvent
        ? filterRelays(relayEvent.tags.filter((t) => t[0] === 'r').map((t) => t[1]))
        : [];

      // 2. Combine with forceful relays for better stats (Antiprimal is key for history/counts)
      const allRelays = [
        ...userRelays,
        'wss://antiprimal.net',
        'wss://relay.damus.io',
        'wss://nos.lol',
      ];

      const targetRelays = NDKRelaySet.fromRelayUrls(allRelays, ndk);

      // Track unique IDs to prevent duplicates affecting counts
      const uniqueFollowers = new Set<string>();
      const uniquePostIds = new Set<string>();
      const uniqueZapIds = new Set<string>();

      // 2. Start Subscriptions (Streaming) with Throttled Updates
      let currentFollowers = 0;
      let currentPosts = 0;
      let currentZaps = 0;
      let updateTimeout: ReturnType<typeof setTimeout> | null = null;

      const scheduleUpdate = () => {
        if (updateTimeout) return;
        updateTimeout = setTimeout(() => {
          setStats({
            followers: currentFollowers,
            posts: currentPosts,
            zaps: currentZaps,
          });
          updateTimeout = null;
        }, 500); // Update UI every 500ms at most
      };

      // Follower count: use ONLY Antiprimal to avoid downloading massive Kind 3 events
      // from multiple relays. Each Kind 3 event is 50-100KB+ (contains ALL of someone's follows).
      const antiprimalOnly = NDKRelaySet.fromRelayUrls(['wss://antiprimal.net'], ndk);
      const followersSub = ndk.subscribe(
        { kinds: [3], '#p': [user.pubkey] },
        { closeOnEose: true, relaySet: antiprimalOnly }
      );

      const postsSub = ndk.subscribe(
        { kinds: [1], authors: [user.pubkey] },
        { closeOnEose: true, relaySet: targetRelays }
      );

      const zapsSub = ndk.subscribe(
        { kinds: [9735], '#p': [user.pubkey] },
        { closeOnEose: true, relaySet: targetRelays }
      );

      followersSub.on('event', (ev: NDKEvent) => {
        if (!uniqueFollowers.has(ev.pubkey) && !allBlockedPubkeys.has(ev.pubkey)) {
          uniqueFollowers.add(ev.pubkey);
          currentFollowers = uniqueFollowers.size;
          scheduleUpdate();
        }
      });

      postsSub.on('event', (ev: NDKEvent) => {
        if (!uniquePostIds.has(ev.id)) {
          uniquePostIds.add(ev.id);
          currentPosts = uniquePostIds.size;
          scheduleUpdate();
        }
      });

      zapsSub.on('event', (ev: NDKEvent) => {
        if (uniqueZapIds.has(ev.id)) return;
        uniqueZapIds.add(ev.id);

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
          currentZaps = Math.floor(currentZaps + amt);
          scheduleUpdate();
        }
      });

      let finishedCount = 0;
      const onDone = () => {
        finishedCount++;
        if (finishedCount >= 3) {
          setLoadingStats(false);
          // Final flush to ensure latest numbers are shown
          if (updateTimeout) {
            clearTimeout(updateTimeout);
            setStats({
              followers: currentFollowers,
              posts: currentPosts,
              zaps: currentZaps,
            });
            updateTimeout = null;
          }
        }
      };

      followersSub.on('eose', onDone);
      postsSub.on('eose', onDone);
      zapsSub.on('eose', onDone);

      // Safety timeout
      setTimeout(() => setLoadingStats(false), 20000); // Increased timeout for more relays
    } catch (e) {
      console.error('Error starting stats stream:', e);
      setLoadingStats(false);
    }
  };

  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediaModalType, setMediaModalType] = useState<'photo' | 'video'>('photo');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [blogEvents, setBlogEvents] = useState<NDKEvent[]>([]);
  const [streamEvents, setStreamEvents] = useState<NDKEvent[]>([]);
  const [viewMode, setViewMode] = useState<
    'feed' | 'media' | 'blog' | 'streams' | 'notifications' | 'replies'
  >('feed');
  const [isBlogModalOpen, setIsBlogModalOpen] = useState(false);
  // Pagination State
  const [feedUntil, setFeedUntil] = useState<number | null>(null);
  const [mediaUntil, setMediaUntil] = useState<number | null>(null);
  const [repliesUntil, setRepliesUntil] = useState<number | null>(null);
  const [hasMoreFeed, setHasMoreFeed] = useState(true);
  const [hasMoreMedia, setHasMoreMedia] = useState(true);
  const [hasMoreReplies, setHasMoreReplies] = useState(true);
  const fetchingRef = useRef(false);
  const feedEoseRef = useRef(false);
  const eoseTimestampRef = useRef(0);
  const followsCacheRef = useRef<string[]>([]);
  const followsFetchedRef = useRef(false);
  const [pendingPosts, setPendingPosts] = useState<NDKEvent[]>([]);
  const [replies, setReplies] = useState<NDKEvent[]>([]);
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);
  const [displayedFeedCount, setDisplayedFeedCount] = useState(20);
  const [displayedRepliesCount, setDisplayedRepliesCount] = useState(20);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const [displayedStreamsCount, setDisplayedStreamsCount] = useState(15);
  const loadMoreStreamsTriggerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(3);
  const { markAsRead, lastSeen } = useNotifications();
  const { allBlockedPubkeys } = useBlockList();
  const [hasNewNotifs, setHasNewNotifs] = useState(false);

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
  const dedupAndSortFeed = (newEvents: NDKEvent[], existingEvents: NDKEvent[]): NDKEvent[] => {
    const combined = [...newEvents, ...existingEvents];
    const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values());
    return unique.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, 200);
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



  const getFollows = useCallback(async () => {
    if (!ndk || !user) return [];

    // Return cached immediately if available
    if (followsCacheRef.current.length > 0) {
      return followsCacheRef.current;
    }

    // Start fetching if not already started
    if (!followsFetchedRef.current) {
      followsFetchedRef.current = true;

      const activeUser = ndk.getUser({ pubkey: user.pubkey });
      const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
        ]);
      };

      try {
        const followedUsersSet = await withTimeout(
          activeUser.follows().catch(() => new Set<import('@nostr-dev-kit/ndk').NDKUser>()),
          3000,
          new Set<import('@nostr-dev-kit/ndk').NDKUser>()
        );
        const followPubkeys = Array.from(followedUsersSet || new Set()).map((u) => u.pubkey);
        if (!followPubkeys.includes(user.pubkey)) followPubkeys.push(user.pubkey);
        followsCacheRef.current = followPubkeys;
      } catch {
        // Fallback to just self if follows fails
        followsCacheRef.current = [user.pubkey];
      }
    } else {
      // If fetch is in progress, wait for it to complete (but not indefinitely)
      let attempts = 0;
      while (followsCacheRef.current.length === 0 && attempts < 60) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }
    }

    return followsCacheRef.current;
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
  }, [
    mediaUntil,
    ndk,
    getFollows,
    isLoadingMoreMedia,
    hasMoreMedia,
    addMediaItems,
    processMediaEvent,
  ]);

  const loadMoreReplies = useCallback(async () => {
    if (!repliesUntil || !ndk || isLoadingMoreReplies || !hasMoreReplies || fetchingRef.current) return;
    fetchingRef.current = true;
    setIsLoadingMoreReplies(true);
    try {
      const authors = await getFollows();
      const filter: NDKFilter = {
        kinds: [1],
        authors: authors,
        limit: 20,
        until: repliesUntil,
      };
      const events = await ndk.fetchEvents(filter);
      const newEvents = Array.from(events).filter((e) => e.tags.some((t) => t[0] === 'e' || t[0] === 'q'));

      if (newEvents.length === 0) {
        setHasMoreReplies(false);
        return;
      }

      setReplies((prev) => {
        const combined = [...prev, ...newEvents];
        const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values());
        return unique.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, 150);
      });

      const oldest = newEvents.sort((a, b) => (a.created_at || 0) - (b.created_at || 0))[0];
      if (oldest?.created_at) setRepliesUntil(oldest.created_at - 1);
    } catch (e) {
      console.error('Error loading more replies:', e);
    } finally {
      setIsLoadingMoreReplies(false);
      fetchingRef.current = false;
    }
  }, [repliesUntil, ndk, getFollows, isLoadingMoreReplies, hasMoreReplies]);

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
        if (feedEoseRef.current) {
          setPendingPosts((prev) => dedupAndSortFeed(currentBuffer, prev));
        } else {
          setFeed((prev) => dedupAndSortFeed(currentBuffer, prev));
        }
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

        eventBuffer.push(apiEvent);
        if (!flushTimeout) {
          flushTimeout = setTimeout(() => {
            flushBuffer();
            flushTimeout = null;
          }, 300); // Batch updates every 300ms
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

  // Initial Replies Subscription
  useEffect(() => {
    if (!ndk || !user || viewMode !== 'replies') return;
    setDisplayedRepliesCount(20);
    let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;
    const startRepliesSub = async () => {
      if (replies.length === 0) setIsRepliesLoading(true);
      const authors = await getFollows();
      const filter: NDKFilter = { kinds: [1], authors: authors, limit: 50 };
      sub = ndk.subscribe(filter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
      });

      let replyBuffer: NDKEvent[] = [];
      let flushTimeout: ReturnType<typeof setTimeout> | null = null;

      const flushBuffer = () => {
        if (replyBuffer.length === 0) return;
        const currentBuffer = [...replyBuffer];
        replyBuffer = [];

        setReplies((prev) => {
          const combined = [...currentBuffer, ...prev];
          const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values());
          return unique.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, 200);
        });
      };

      sub.on('event', (ev: NDKEvent) => {
        if (!ev.tags.some((t) => t[0] === 'e' || t[0] === 'q')) return;

        replyBuffer.push(ev);
        if (!flushTimeout) {
          flushTimeout = setTimeout(() => {
            flushBuffer();
            flushTimeout = null;
          }, 400);
        }
      });

      sub.on('eose', () => {
        flushBuffer();
        setIsRepliesLoading(false);
        setReplies((prev) => {
          if (prev.length > 0) {
            const oldest = prev[prev.length - 1];
            if (oldest.created_at) setRepliesUntil(oldest.created_at - 1);
          }
          return prev;
        });
      });
    };
    startRepliesSub();
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
            const dTag = ev.getMatchingTags('d')[0]?.[1];
            if (!dTag) return prev; // Ignore if no d tag for replaceable
            const filtered = prev.filter((e) => {
              const eDTag = e.getMatchingTags('d')[0]?.[1];
              return !(e.pubkey === ev.pubkey && eDTag === dTag);
            });
            return [...filtered, ev].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          });
        } else if (viewMode === 'streams') {
          setStreamEvents((prev) => {
            const dTag = ev.getMatchingTags('d')[0]?.[1];
            if (!dTag) return prev; // Ignore if no d tag
            const filtered = prev.filter((e) => {
              const eDTag = e.getMatchingTags('d')[0]?.[1];
              return !(e.pubkey === ev.pubkey && eDTag === dTag);
            });
            return [...filtered, ev].sort((a, b) => {
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



  useEffect(() => {
    if (!ndk || !user) return;
    let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;

    const startNotificationSub = async () => {
      // Use since to avoid re-downloading old events on every page load
      // Cap at 7 days to prevent massive initial fetches
      const maxLookback = Math.floor(Date.now() / 1000) - 86400 * 7;

      // If we are actively viewing notifications, we want to see history (up to maxLookback)
      // regardless of when we last checked. Otherwise, just check for new items.
      const sinceTimestamp =
        viewMode === 'notifications' || lastSeen === 0
          ? maxLookback
          : Math.max(lastSeen, maxLookback);

      // Main notification stream: replies, reposts, reactions, zaps
      // Kind 3 (contacts) is handled separately — each event is 50-100KB+
      // and would cause massive bandwidth usage in an open subscription
      const filter: NDKFilter = {
        kinds: [1, 6, 7, 9735],
        '#p': [user.pubkey],
        since: sinceTimestamp,
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

        setNotifications((prev) => {
          const combined = [...buffer, ...prev];

          // Dedupe by ID
          const uniqueById = Array.from(new Map(combined.map((item) => [item.id, item])).values());

          const sorted = uniqueById
            .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
            .slice(0, 50);

          if (sorted.length > 0 && (sorted[0].created_at || 0) > lastSeen) {
            setHasNewNotifs(true);
          }

          return sorted;
        });
      };

      sub.on('event', async (ev: NDKEvent) => {
        const isTargetedToUs = ev.tags.some(
          (t) => (t[0] === 'p' || t[0] === 'e') && t[1] === user.pubkey
        );
        if (!isTargetedToUs) return;
        if (ev.pubkey === user.pubkey || allBlockedPubkeys.has(ev.pubkey)) return;

        notifBuffer.push(ev);
        if (!notifFlushTimeout) {
          notifFlushTimeout = setTimeout(() => {
            flushNotifications();
            notifFlushTimeout = null;
          }, 500);
        }
      });

      sub.on('eose', () => {
        flushNotifications();
      });

    };




    startNotificationSub();
    return () => {
      if (sub) sub.stop();
    };
  }, [ndk, user, allBlockedPubkeys, lastSeen, viewMode]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (viewMode !== 'feed' && viewMode !== 'replies') return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting) {
          if (debounceTimer) clearTimeout(debounceTimer);

          debounceTimer = setTimeout(() => {
            if (viewMode === 'feed') {
              if (displayedFeedCount < feed.length) {
                setDisplayedFeedCount((prev) => Math.min(prev + 20, feed.length));
              } else if (hasMoreFeed && !isLoadingMoreFeed) {
                loadMoreFeed();
              }
            } else if (viewMode === 'replies') {
              if (displayedRepliesCount < replies.length) {
                setDisplayedRepliesCount((prev) => Math.min(prev + 20, replies.length));
              } else if (hasMoreReplies && !isLoadingMoreReplies) {
                loadMoreReplies();
              }
            }
          }, 150);
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
  }, [
    viewMode,
    displayedFeedCount,
    feed.length,
    hasMoreFeed,
    isLoadingMoreFeed,
    loadMoreFeed,
    displayedRepliesCount,
    replies.length,
    hasMoreReplies,
    isLoadingMoreReplies,
    loadMoreReplies,
  ]);

  // Reset displayed count when feed or replies change significantly
  useEffect(() => {
    if (viewMode === 'feed' && feed.length > 0) {
      setDisplayedFeedCount((prev) => Math.min(prev, Math.max(20, feed.length)));
    } else if (viewMode === 'replies' && replies.length > 0) {
      setDisplayedRepliesCount((prev) => Math.min(prev, Math.max(20, replies.length)));
    }
  }, [viewMode, feed.length, replies.length]);

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

      // Add mentions
      const mentionedPubkeys = extractMentions(finalContent);
      mentionedPubkeys.forEach(pubkey => {
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

                    <li className="app-item" onClick={() => navigate('/recipes')}>
                      <span className="app-icon">🍳</span> Recipes
                    </li>
                    <li className="app-item" onClick={() => navigate('/livestreams')}>
                      <span className="app-icon">📺</span> Live
                    </li>
                    <li className="app-item" onClick={() => navigate('/badges')}>
                      <span className="app-icon">🏆</span> Badges
                    </li>
                    <li className="app-item" onClick={() => navigate('/marketplace')}>
                      <span className="app-icon">🛒</span> Shop
                    </li>
                    <li className="app-item" onClick={() => navigate('/photos')}>
                      <span className="app-icon">🖼️</span> Photos
                    </li>
                  </ul>
                </div>
              </div>
            </div>

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
                    markAsRead();
                  }}
                  style={{ position: 'relative' }}
                >
                  Notifications
                  {hasNewNotifs && <span className="unread-dot"></span>}
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
                    {feed.slice(0, displayedFeedCount).map((event) => (
                      <FeedItem key={event.id} event={event} />
                    ))}
                    <div ref={loadMoreTriggerRef} style={{ height: '1px' }} />
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
                                    <img
                                      src={item.url}
                                      alt=""
                                      loading="lazy"
                                      decoding="async"
                                      style={{ width: '100%', height: 'auto' }}
                                    />
                                  ) : isExpanded ? (
                                    ytMatch ? (
                                      <iframe
                                        src={`https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`}
                                        title="YouTube video"
                                        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                        style={{ width: '100%', height: '100%', border: 'none' }}
                                        loading="lazy"
                                      />
                                    ) : vimeoMatch ? (
                                      <iframe
                                        src={`https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`}
                                        title="Vimeo video"
                                        allow="autoplay; fullscreen; picture-in-picture"
                                        allowFullScreen
                                        style={{ width: '100%', height: '100%', border: 'none' }}
                                        loading="lazy"
                                      />
                                    ) : streamableMatch ? (
                                      <iframe
                                        src={`https://streamable.com/e/${streamableMatch[1]}?autoplay=1`}
                                        title="Streamable video"
                                        allowFullScreen
                                        style={{ width: '100%', height: '100%', border: 'none' }}
                                        loading="lazy"
                                      />
                                    ) : (
                                      <video
                                        src={item.url}
                                        controls
                                        autoPlay
                                        preload="metadata"
                                        style={{ width: '100%', height: '100%' }}
                                      />
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



                {viewMode === 'streams' && (
                  <div style={{ padding: '15px' }}>
                    <div className="streams-list">
                      {streamEvents.length === 0 && (
                        <div style={{ padding: '20px', width: '100%', textAlign: 'center' }}>
                          No active livestreams from people you follow.
                        </div>
                      )}
                      {streamEvents.slice(0, displayedStreamsCount).map((stream) => {
                        const title = stream.getMatchingTags('title')[0]?.[1] || 'Untitled Stream';
                        const image = stream.getMatchingTags('image')[0]?.[1];
                        const dTag = stream.getMatchingTags('d')[0]?.[1];
                        const summary =
                          stream.getMatchingTags('summary')[0]?.[1] || stream.content || '';
                        const hostPubkey = stream.getMatchingTags('p')[0]?.[1] || stream.pubkey;
                        const url = `/live/${hostPubkey}/${dTag}`;

                        return (
                          <Link key={stream.id} to={url} className="stream-list-item">
                            <div className="stream-list-thumb-container">
                              {image ? (
                                <img src={image} alt={title} className="stream-list-thumb" />
                              ) : (
                                <div className="stream-list-no-image">LIVE</div>
                              )}
                              <div className="live-badge-overlay">LIVE</div>
                            </div>
                            <div className="stream-list-info">
                              <div className="stream-list-title">{title}</div>
                              <div className="stream-list-host">Host: {hostPubkey.slice(0, 8)}</div>
                              <div className="stream-list-summary">{summary}</div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>

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

                {viewMode === 'replies' && (
                  <div className="feed-container">
                    {isRepliesLoading && replies.length === 0 && (
                      <div style={{ padding: '20px' }}>Loading Replies...</div>
                    )}
                    {replies.length === 0 && !isRepliesLoading && (
                      <div style={{ padding: '20px' }}>No replies found from people you follow.</div>
                    )}
                    {replies.slice(0, displayedRepliesCount).map((event) => {
                      const parentId = event.tags.find((t) => t[0] === 'e')?.[1];
                      return (
                        <div key={event.id} className="reply-thread-group">
                          {parentId && (
                            <div className="reply-context">
                              <EmbeddedNote id={parentId} />
                            </div>
                          )}
                          <div className={`reply-child ${!parentId ? 'no-parent' : ''}`}>
                            <FeedItem event={event} />
                          </div>
                        </div>
                      );
                    })}
                    <div ref={loadMoreTriggerRef} style={{ height: '1px' }} />
                    {isLoadingMoreReplies && (
                      <div style={{ padding: '15px', textAlign: 'center' }}>
                        Loading more replies...
                      </div>
                    )}
                  </div>
                )}

                {viewMode === 'notifications' && (
                  <div className="notifications-tab-content">
                    {notifications.length === 0 && (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                        No notifications yet.
                      </div>
                    )}
                    <div className="notifications-list">
                      {notifications
                        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
                        .map((event) => (
                          <NotificationItem
                            key={event.id}
                            event={event}
                            onClick={(link: string) => navigate(link)}
                          />
                        ))}
                    </div>
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
    </div >
  );
};

export default HomePage;

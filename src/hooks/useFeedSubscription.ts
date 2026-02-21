import { useState, useCallback, useRef, useEffect } from 'react';
import { NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';
import NDK from '@nostr-dev-kit/ndk';
import type { MediaItem } from './useMediaSubscription';

export function useFeedSubscription(
    ndk: NDK | undefined,
    user: { pubkey: string } | null,
    viewMode: string,
    getFollows: () => Promise<string[]>,
    processMediaEvent: (ev: NDKEvent) => MediaItem | null,
    addMediaItems: (items: MediaItem[]) => void
) {
    const [feed, setFeed] = useState<NDKEvent[]>([]);
    const [feedLoading, setFeedLoading] = useState(true);
    const [pendingPosts, setPendingPosts] = useState<NDKEvent[]>([]);
    const [replies, setReplies] = useState<NDKEvent[]>([]);

    const [feedUntil, setFeedUntil] = useState<number | null>(null);
    const [repliesUntil, setRepliesUntil] = useState<number | null>(null);

    const [hasMoreFeed, setHasMoreFeed] = useState(true);
    const [hasMoreReplies, setHasMoreReplies] = useState(true);
    const [isLoadingMoreFeed, setIsLoadingMoreFeed] = useState(false);
    const [isLoadingMoreReplies, setIsLoadingMoreReplies] = useState(false);

    const [displayedFeedCount, setDisplayedFeedCount] = useState(20);
    const [displayedRepliesCount, setDisplayedRepliesCount] = useState(20);

    const fetchingFeedRef = useRef(false);
    const fetchingRepliesRef = useRef(false);
    const feedEoseRef = useRef(false);
    const eoseTimestampRef = useRef(0);

    const feedRef = useRef(feed);
    feedRef.current = feed;

    const repliesRef = useRef(replies);
    repliesRef.current = replies;

    // Helper to dedupe and insert feed events in sorted order
    const dedupAndSortFeed = (newEvents: NDKEvent[], existingEvents: NDKEvent[]): NDKEvent[] => {
        const existingIds = new Set(existingEvents.map((e) => e.id));
        const toInsert = newEvents.filter((e) => !existingIds.has(e.id));
        if (toInsert.length === 0) return existingEvents;

        const result = [...existingEvents];
        for (const ev of toInsert) {
            const ts = ev.created_at || 0;
            let lo = 0, hi = result.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if ((result[mid].created_at || 0) > ts) lo = mid + 1;
                else hi = mid;
            }
            result.splice(lo, 0, ev);
        }
        if (result.length > 200) result.length = 200;
        return result;
    };

    const loadMoreFeed = useCallback(async () => {
        if (!feedUntil || !ndk || isLoadingMoreFeed || !hasMoreFeed || fetchingFeedRef.current) return;
        fetchingFeedRef.current = true;
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
            fetchingFeedRef.current = false;
        }
    }, [feedUntil, ndk, getFollows, isLoadingMoreFeed, hasMoreFeed]);

    const loadMoreReplies = useCallback(async () => {
        if (!repliesUntil || !ndk || isLoadingMoreReplies || !hasMoreReplies || fetchingRepliesRef.current)
            return;
        fetchingRepliesRef.current = true;
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
            const newEvents = Array.from(events).filter((e) =>
                e.tags.some((t) => t[0] === 'e' || t[0] === 'q')
            );

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
            fetchingRepliesRef.current = false;
        }
    }, [repliesUntil, ndk, getFollows, isLoadingMoreReplies, hasMoreReplies]);

    // Initial Feed Subscription
    useEffect(() => {
        if (!ndk || !user || viewMode !== 'feed') return;
        feedEoseRef.current = false;
        setPendingPosts([]);
        setDisplayedFeedCount(20);
        let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;

        const startFeedSub = async () => {
            if (feed.length === 0) setFeedLoading(true);

            await new Promise(resolve => setTimeout(resolve, 50));

            const authors = await getFollows();
            const filter: NDKFilter = { kinds: [1, 6], authors: authors, limit: 25 };
            sub = ndk.subscribe(filter, {
                closeOnEose: false,
                cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
                groupable: false,
            });

            let hasReceivedEose = false;
            let eventBuffer: NDKEvent[] = [];
            let mediaBuffer: MediaItem[] = [];
            let replyBuffer: NDKEvent[] = [];
            let rafId: number | null = null;

            const flushBuffer = () => {
                rafId = null;
                if (eventBuffer.length > 0) {
                    const batch = eventBuffer;
                    eventBuffer = [];
                    if (hasReceivedEose) {
                        setPendingPosts((prev) => {
                            const feedIds = new Set(feedRef.current.map((e) => e.id));
                            const trulyNew = batch.filter((e) => !feedIds.has(e.id));
                            if (trulyNew.length === 0) return prev;
                            return dedupAndSortFeed(trulyNew, prev);
                        });
                    } else {
                        setFeed((prev) => dedupAndSortFeed(batch, prev));
                    }
                }
                if (mediaBuffer.length > 0) {
                    const mediaBatch = mediaBuffer;
                    mediaBuffer = [];
                    addMediaItems(mediaBatch);
                }
                if (replyBuffer.length > 0) {
                    const replyBatch = replyBuffer;
                    replyBuffer = [];
                    setReplies((prev) => {
                        const ids = new Set(prev.map((e) => e.id));
                        const newReplies = replyBatch.filter((e) => !ids.has(e.id));
                        if (newReplies.length === 0) return prev;
                        const result = [...prev, ...newReplies];
                        result.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
                        if (result.length > 200) result.length = 200;
                        return result;
                    });
                }
            };

            sub.on('event', (apiEvent: NDKEvent) => {
                const mediaItem = processMediaEvent(apiEvent);
                if (mediaItem) {
                    mediaBuffer.push(mediaItem);
                }

                if (apiEvent.kind === 1 && apiEvent.tags.some((t) => t[0] === 'e')) {
                    replyBuffer.push(apiEvent);
                    if (rafId === null) {
                        rafId = requestAnimationFrame(flushBuffer);
                    }
                    return;
                }

                eventBuffer.push(apiEvent);
                if (rafId === null) {
                    rafId = requestAnimationFrame(flushBuffer);
                }
            });

            sub.on('eose', () => {
                if (rafId !== null) cancelAnimationFrame(rafId);
                rafId = null;
                flushBuffer();

                hasReceivedEose = true;
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

    // Replies pagination sync
    useEffect(() => {
        if (viewMode !== 'replies') return;
        setDisplayedRepliesCount(20);
        setReplies((prev) => {
            if (prev.length > 0) {
                const oldest = prev[prev.length - 1];
                if (oldest.created_at) setRepliesUntil(oldest.created_at - 1);
            }
            return prev;
        });
    }, [viewMode]);

    const flushPendingPosts = useCallback(() => {
        setFeed((prev) => {
            const feedIds = new Set(prev.map((e) => e.id));
            const trulyNew = pendingPosts.filter((e) => !feedIds.has(e.id));
            if (trulyNew.length === 0) return prev;
            return dedupAndSortFeed(trulyNew, prev);
        });
        setPendingPosts([]);
    }, [pendingPosts]);

    return {
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
        feedRef,
        repliesRef,
    };
}

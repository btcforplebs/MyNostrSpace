import { useState, useCallback, useRef, useEffect } from 'react';
import { NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';
import NDK from '@nostr-dev-kit/ndk';

export interface MediaItem {
    id: string;
    url: string;
    type: 'image' | 'video';
    created_at: number;
    originalEvent: NDKEvent;
    thumb?: string;
}

const getCanonicalUrl = (url: string) => {
    try {
        const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        if (ytMatch) return `https://www.youtube.com/watch?v=${ytMatch[1]}`;
        return url;
    } catch {
        return url;
    }
};

export function useMediaSubscription(
    ndk: NDK | undefined,
    user: { pubkey: string } | null,
    viewMode: string,
    getFollows: () => Promise<string[]>
) {
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const [mediaLoading, setMediaLoading] = useState(false);
    const [mediaUntil, setMediaUntil] = useState<number | null>(null);
    const [hasMoreMedia, setHasMoreMedia] = useState(true);
    const [isLoadingMoreMedia, setIsLoadingMoreMedia] = useState(false);

    const fetchingMediaRef = useRef(false);

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

            // Extract video thumbnail helper
            const extractVideoThumb = (event: NDKEvent, videoUrl: string): string | undefined => {
                const thumb =
                    event.getMatchingTags('thumb')[0]?.[1] || event.getMatchingTags('image')[0]?.[1];
                if (thumb) return thumb;

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
                    if (tagUrl && tagMime?.startsWith('image/')) return tagUrl;
                }

                const imgMatches = content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif)(\?[^\s]*)?/gi);
                if (imgMatches) return imgMatches.find((m) => m !== videoUrl);
                return undefined;
            };

            const imgRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif)(\?[^\s]*)?/i;
            const videoRegex = /https?:\/\/[^\s]+\.(mp4|webm|ogg|mov)(\?[^\s]*)?/i;

            // Check for images first
            const imgMatch = content.match(imgRegex);
            if (imgMatch) {
                return {
                    id: ev.id + '-img',
                    url: imgMatch[0],
                    type: 'image',
                    created_at: ev.created_at || 0,
                    originalEvent: ev,
                };
            }

            // Check for direct video files
            const vidMatch = content.match(videoRegex);
            if (vidMatch) {
                return {
                    id: ev.id + '-vid',
                    url: vidMatch[0],
                    type: 'video',
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
                    type: 'video',
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
                    type: 'video',
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
                    type: 'video',
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

            for (const item of prev) {
                const canonical = getCanonicalUrl(item.url);
                if (!seenUrls.has(canonical)) {
                    seenUrls.add(canonical);
                    result.push(item);
                }
            }

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

    const loadMoreMedia = useCallback(async () => {
        if (!mediaUntil || !ndk || isLoadingMoreMedia || !hasMoreMedia || fetchingMediaRef.current) return;
        fetchingMediaRef.current = true;
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
            fetchingMediaRef.current = false;
        }
    }, [mediaUntil, ndk, getFollows, isLoadingMoreMedia, hasMoreMedia, addMediaItems, processMediaEvent]);

    // Media tab subscription parsing (captures files without main feed presence)
    useEffect(() => {
        if (!ndk || !user || viewMode !== 'media') return;
        setMediaLoading(mediaItems.length === 0);
        setMediaItems((prev) => {
            if (prev.length > 0) {
                const oldest = prev[prev.length - 1];
                if (oldest.created_at) setMediaUntil(oldest.created_at - 1);
            }
            return prev;
        });

        let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;
        const startMediaSub = async () => {
            const authors = await getFollows();
            const filter: NDKFilter = { kinds: [1063], authors: authors, limit: 25 };
            sub = ndk.subscribe(filter, {
                closeOnEose: true,
                cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
                groupable: false,
            });

            let mBuffer: MediaItem[] = [];
            let mRafId: number | null = null;

            const flushMBuffer = () => {
                mRafId = null;
                if (mBuffer.length === 0) return;
                const batch = mBuffer;
                mBuffer = [];
                addMediaItems(batch);
            };

            sub.on('event', (ev: NDKEvent) => {
                const newItem = processMediaEvent(ev);
                if (newItem) {
                    mBuffer.push(newItem);
                    if (mRafId === null) {
                        mRafId = requestAnimationFrame(flushMBuffer);
                    }
                }
            });
            sub.on('eose', () => {
                if (mRafId !== null) cancelAnimationFrame(mRafId);
                mRafId = null;
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

    return {
        mediaItems,
        mediaLoading,
        hasMoreMedia,
        isLoadingMoreMedia,
        loadMoreMedia,
        processMediaEvent,
        addMediaItems
    };
}

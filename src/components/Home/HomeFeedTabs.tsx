import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import type { MediaItem } from '../../hooks/useMediaSubscription';
import { VirtualFeedItem, NotificationItem, LazyVideoEmbed, ReplyCard } from './FeedItems';
import { VideoThumbnail } from '../Shared/VideoThumbnail';
import { EmbeddedNote } from '../Shared/EmbeddedNote';

interface HomeFeedTabsProps {
    viewMode: 'feed' | 'media' | 'blog' | 'streams' | 'notifications' | 'replies';
    columnCount: number;

    feed: NDKEvent[];
    feedLoading: boolean;
    pendingPosts: NDKEvent[];
    flushPendingPosts: () => void;
    displayedFeedCount: number;
    setDisplayedFeedCount: React.Dispatch<React.SetStateAction<number>>;
    hasMoreFeed: boolean;
    isLoadingMoreFeed: boolean;
    loadMoreFeed: () => void;

    mediaItems: MediaItem[];
    mediaLoading: boolean;
    hasMoreMedia: boolean;
    isLoadingMoreMedia: boolean;
    loadMoreMedia: () => void;

    blogEvents: NDKEvent[];

    streamEvents: NDKEvent[];
    displayedStreamsCount: number;
    setDisplayedStreamsCount: React.Dispatch<React.SetStateAction<number>>;

    replies: NDKEvent[];
    isRepliesLoading: boolean;
    displayedRepliesCount: number;
    setDisplayedRepliesCount: React.Dispatch<React.SetStateAction<number>>;
    hasMoreReplies: boolean;
    isLoadingMoreReplies: boolean;
    loadMoreReplies: () => void;

    notifications: NDKEvent[];
}

export const HomeFeedTabs: React.FC<HomeFeedTabsProps> = ({
    viewMode,
    columnCount,
    feed,
    feedLoading,
    pendingPosts,
    flushPendingPosts,
    displayedFeedCount,
    setDisplayedFeedCount,
    hasMoreFeed,
    isLoadingMoreFeed,
    loadMoreFeed,
    mediaItems,
    mediaLoading,
    hasMoreMedia,
    isLoadingMoreMedia,
    loadMoreMedia,
    blogEvents,
    streamEvents,
    displayedStreamsCount,
    setDisplayedStreamsCount,
    replies,
    isRepliesLoading,
    displayedRepliesCount,
    setDisplayedRepliesCount,
    hasMoreReplies,
    isLoadingMoreReplies,
    loadMoreReplies,
    notifications,
}) => {
    const navigate = useNavigate();
    const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);

    const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
    const loadMoreStreamsTriggerRef = useRef<HTMLDivElement>(null);

    const feedRef = useRef(feed);
    feedRef.current = feed;
    const repliesRef = useRef(replies);
    repliesRef.current = replies;

    const displayedFeedCountRef = useRef(displayedFeedCount);
    displayedFeedCountRef.current = displayedFeedCount;
    const displayedRepliesCountRef = useRef(displayedRepliesCount);
    displayedRepliesCountRef.current = displayedRepliesCount;

    const loadMoreFeedRef = useRef(loadMoreFeed);
    loadMoreFeedRef.current = loadMoreFeed;
    const loadMoreRepliesRef = useRef(loadMoreReplies);
    loadMoreRepliesRef.current = loadMoreReplies;

    const hasMoreFeedRef = useRef(hasMoreFeed);
    hasMoreFeedRef.current = hasMoreFeed;
    const isLoadingMoreFeedRef = useRef(isLoadingMoreFeed);
    isLoadingMoreFeedRef.current = isLoadingMoreFeed;

    const hasMoreRepliesRef = useRef(hasMoreReplies);
    hasMoreRepliesRef.current = hasMoreReplies;
    const isLoadingMoreRepliesRef = useRef(isLoadingMoreReplies);
    isLoadingMoreRepliesRef.current = isLoadingMoreReplies;

    // Intersection Observer for infinite scroll on feed and replies
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
                            const curFeedLen = feedRef.current.length;
                            const curDisplayed = displayedFeedCountRef.current;
                            if (curDisplayed < curFeedLen) {
                                setDisplayedFeedCount((prev) => Math.min(prev + 20, curFeedLen));
                            } else if (hasMoreFeedRef.current && !isLoadingMoreFeedRef.current) {
                                loadMoreFeedRef.current();
                            }
                        } else if (viewMode === 'replies') {
                            const curRepliesLen = repliesRef.current.length;
                            const curDisplayed = displayedRepliesCountRef.current;
                            if (curDisplayed < curRepliesLen) {
                                setDisplayedRepliesCount((prev) => Math.min(prev + 20, curRepliesLen));
                            } else if (hasMoreRepliesRef.current && !isLoadingMoreRepliesRef.current) {
                                loadMoreRepliesRef.current();
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
    }, [viewMode, setDisplayedFeedCount, setDisplayedRepliesCount]);

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
    }, [viewMode, displayedStreamsCount, streamEvents.length, setDisplayedStreamsCount]);

    return (
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
                    {feedLoading && feed.length === 0 && <div style={{ padding: '20px' }}>Loading Feed...</div>}
                    {pendingPosts.length > 0 && (
                        <div className="new-posts-banner" onClick={flushPendingPosts}>
                            {pendingPosts.length} new post{pendingPosts.length !== 1 ? 's' : ''} — click to show
                        </div>
                    )}
                    {feed.slice(0, displayedFeedCount).map((event) => (
                        <VirtualFeedItem key={event.id} event={event} />
                    ))}
                    <div ref={loadMoreTriggerRef} style={{ height: '1px' }} />
                    {isLoadingMoreFeed && (
                        <div style={{ padding: '15px', textAlign: 'center' }}>Loading more posts...</div>
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
                            const columns: MediaItem[][] = Array.from({ length: columnCount }, () => []);
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
                                        const streamableMatch = item.url.match(/streamable\.com\/([a-zA-Z0-9]+)/);
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
                                                        <LazyVideoEmbed type="youtube" videoId={ytMatch[1]} />
                                                    ) : vimeoMatch ? (
                                                        <LazyVideoEmbed type="vimeo" videoId={vimeoMatch[1]} />
                                                    ) : streamableMatch ? (
                                                        <LazyVideoEmbed type="streamable" videoId={streamableMatch[1]} />
                                                    ) : (
                                                        <LazyVideoEmbed type="video" url={item.url} />
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
                            const summary = stream.getMatchingTags('summary')[0]?.[1] || stream.content || '';
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

                    <div ref={loadMoreStreamsTriggerRef} style={{ height: '20px', margin: '10px 0' }} />
                    {displayedStreamsCount < streamEvents.length && (
                        <div style={{ padding: '10px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
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
                                    <div className="reply-context-wrapper">
                                        <EmbeddedNote id={parentId} />
                                    </div>
                                )}
                                <div className="reply-container">
                                    {parentId && <div className="reply-connector">↳</div>}
                                    <div className="reply-child-card">
                                        <ReplyCard event={event} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={loadMoreTriggerRef} style={{ height: '1px' }} />
                    {isLoadingMoreReplies && (
                        <div style={{ padding: '15px', textAlign: 'center' }}>Loading more replies...</div>
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
                        {notifications.map((event) => (
                            <NotificationItem key={event.id} event={event} onClick={(link: string) => navigate(link)} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

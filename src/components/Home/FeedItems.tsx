import React, { useEffect, useState, useRef, memo } from 'react';
import { Link } from 'react-router-dom';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { FeedItem } from '../Shared/FeedItem';
import { Avatar } from '../Shared/Avatar';
import { useProfile } from '../../hooks/useProfile';
import { RichTextRenderer } from '../Shared/RichTextRenderer';
import { InteractionBar } from '../Shared/InteractionBar';

// Shared IntersectionObserver for all feed items (Safari-friendly: single observer)
const feedObserverCallbacks = new Map<Element, () => void>();
let sharedFeedObserver: IntersectionObserver | null = null;

export function getSharedFeedObserver(): IntersectionObserver {
    if (!sharedFeedObserver) {
        sharedFeedObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        const cb = feedObserverCallbacks.get(entry.target);
                        if (cb) {
                            cb();
                            feedObserverCallbacks.delete(entry.target);
                            sharedFeedObserver!.unobserve(entry.target);
                        }
                    }
                }
            },
            { rootMargin: '200px', threshold: 0 }
        );
    }
    return sharedFeedObserver;
}

// Virtualized feed item - only renders when in viewport (uses shared observer)
export const VirtualFeedItem: React.FC<{ event: NDKEvent; hideThreadButton?: boolean }> = React.memo(
    ({ event, hideThreadButton }) => {
        const [isVisible, setIsVisible] = useState(false);
        const itemRef = useRef<HTMLDivElement>(null);

        useEffect(() => {
            const element = itemRef.current;
            if (!element) return;

            const observer = getSharedFeedObserver();
            feedObserverCallbacks.set(element, () => setIsVisible(true));
            observer.observe(element);

            return () => {
                feedObserverCallbacks.delete(element);
                observer.unobserve(element);
            };
        }, []);

        if (!isVisible) {
            return (
                <div
                    ref={itemRef}
                    style={{
                        minHeight: '120px',
                        background: '#f9f9f9',
                        borderBottom: '1px solid #eee',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <span style={{ color: '#ccc', fontSize: '12px' }}>Loading...</span>
                </div>
            );
        }

        return (
            <div ref={itemRef}>
                <FeedItem event={event} hideThreadButton={hideThreadButton} />
            </div>
        );
    }
);

// Single notification item - shows who did what to your post
export const NotificationItem = memo(
    ({ event, onClick }: { event: NDKEvent; onClick: (link: string) => void }) => {
        const { profile } = useProfile(event.pubkey);

        const authorName = profile?.name || profile?.displayName || event.pubkey.slice(0, 8);
        const targetId = event.tags.find((t) => t[0] === 'e')?.[1] || null;

        // Determine action text
        let actionText = '';
        let actionIcon = '';
        let threadId: string | null = null;

        if (event.kind === 7) {
            actionIcon = '♥';
            actionText = 'liked your post';
            threadId = targetId;
        } else if (event.kind === 6) {
            actionIcon = '↻';
            actionText = 'reposted your post';
            threadId = targetId;
        } else if (event.kind === 1) {
            actionIcon = '💬';
            actionText = 'replied to your post';
            // For replies, the targetId is the post they replied to (parent)
            // Navigate to that parent post's thread
            threadId = targetId;
        } else if (event.kind === 9735) {
            actionIcon = '⚡';
            actionText = 'zapped your post';
            threadId = targetId;
        }

        return (
            <div
                className="notification-item clickable"
                onClick={() => {
                    if (threadId) {
                        onClick(`/thread/${threadId}`);
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

// Lazy video embed component for Media gallery
export const LazyVideoEmbed: React.FC<{
    type: 'youtube' | 'vimeo' | 'streamable' | 'video';
    videoId?: string;
    url?: string;
}> = ({ type, videoId, url }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setIsLoaded(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '100px' }
        );

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    if (!isLoaded) {
        return (
            <div
                ref={containerRef}
                style={{
                    width: '100%',
                    aspectRatio: '16/9',
                    backgroundColor: '#f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <span>Loading video...</span>
            </div>
        );
    }

    if (type === 'youtube' && videoId) {
        return (
            <iframe
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                title="YouTube video"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ width: '100%', height: '100%', border: 'none' }}
            />
        );
    }

    if (type === 'vimeo' && videoId) {
        return (
            <iframe
                src={`https://player.vimeo.com/video/${videoId}?autoplay=1`}
                title="Vimeo video"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                style={{ width: '100%', height: '100%', border: 'none' }}
            />
        );
    }

    if (type === 'streamable' && videoId) {
        return (
            <iframe
                src={`https://streamable.com/e/${videoId}?autoplay=1`}
                title="Streamable video"
                allowFullScreen
                style={{ width: '100%', height: '100%', border: 'none' }}
            />
        );
    }

    // Direct video file
    return (
        <video
            src={url}
            controls
            autoPlay
            preload="metadata"
            style={{ width: '100%', height: '100%' }}
        />
    );
};

export const ReplyCard = memo(({ event }: { event: NDKEvent }) => {
    const { profile } = useProfile(event.pubkey);
    const authorName = profile?.name || profile?.displayName || event.pubkey.slice(0, 8);

    const noteId = (() => {
        try { return nip19.noteEncode(event.id); } catch { return event.id; }
    })();

    return (
        <div className="reply-card">
            <div className="reply-card-header">
                <div className="reply-card-author">
                    <Avatar
                        pubkey={event.pubkey}
                        src={profile?.picture}
                        size={40}
                        className="reply-card-avatar"
                    />
                    <Link to={`/p/${event.pubkey}`} className="reply-card-name">
                        {authorName}
                    </Link>
                </div>
            </div>
            <div className="reply-card-body">
                <div className="reply-card-text">
                    <RichTextRenderer content={event.content} />
                </div>
                <div className="reply-card-meta">
                    Posted {new Date((event.created_at || 0) * 1000).toLocaleString()}
                </div>
                <div className="reply-card-actions">
                    <InteractionBar event={event} onCommentClick={() => { }} />
                    <Link to={`/thread/${noteId}`} className="show-thread-link">
                        View full thread
                    </Link>
                </div>
            </div>
        </div>
    );
});

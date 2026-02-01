import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { RichTextRenderer } from './RichTextRenderer';
import { InteractionBar } from './InteractionBar';
import { useNostr } from '../../context/NostrContext';
import { useEffect, useCallback } from 'react';
import { useLightbox } from '../../context/LightboxContext';

interface FeedItemProps {
    event: NDKEvent;
}

export const FeedItem: React.FC<FeedItemProps> = ({ event }) => {
    const { ndk, user, login } = useNostr();
    const { openLightbox } = useLightbox();
    const [showCommentForm, setShowCommentForm] = useState(false);
    const [showThread, setShowThread] = useState(false);
    const [comments, setComments] = useState<NDKEvent[]>([]);
    const [commentText, setCommentText] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingThread, setLoadingThread] = useState(false);
    const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");

    const fetchThread = useCallback(async () => {
        if (!ndk) return;
        setLoadingThread(true);
        try {
            const filter: NDKFilter = {
                kinds: [1],
                '#e': [event.id]
            };
            const results = await ndk.fetchEvents(filter);
            const sortedResults = Array.from(results).sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
            // Fetch profiles for authors
            await Promise.all(sortedResults.map(e => e.author.fetchProfile()));
            setComments(sortedResults);
        } catch (error) {
            console.error("Failed to fetch thread:", error);
        } finally {
            setLoadingThread(false);
        }
    }, [ndk, event.id]);

    useEffect(() => {
        if (showThread && comments.length === 0) {
            fetchThread();
        }
    }, [showThread, comments.length, fetchThread]);

    const moodMatch = event.content.match(/^Mood: (.*?)\n\n/);
    const displayContent = moodMatch ? event.content.replace(/^Mood: (.*?)\n\n/, '') : event.content;
    const displayMood = moodMatch ? moodMatch[1] : null;

    const handlePostComment = async (parentEvent: NDKEvent, text: string, isTopLevel: boolean) => {
        if (!ndk || !user) {
            await login();
            return;
        }
        if (!text.trim()) return;

        setIsSubmitting(true);
        try {
            const reply = new NDKEvent(ndk);
            reply.kind = 1;
            reply.content = text;

            // Add tags for reply structure (NIP-10)
            // Use parentEvent (could be the main post OR a comment)
            const rootId = isTopLevel ? parentEvent.id : (parentEvent.tags.find(t => t[0] === 'e' && t[3] === 'root')?.[1] || parentEvent.id);

            reply.tags = [
                ['e', rootId, '', 'root'],
                ['e', parentEvent.id, '', 'reply'],
                ['p', parentEvent.pubkey]
            ];

            await reply.publish();

            if (isTopLevel) {
                setCommentText("");
                setShowCommentForm(false);
            } else {
                setReplyText("");
                setActiveReplyId(null);
            }

            // Add to local state so it appears immediately
            setComments(prev => [...prev, reply]);
            setShowThread(true);
            alert("Comment posted!");
        } catch (error) {
            console.error("Failed to post comment:", error);
            alert("Failed to post comment");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="feed-item">
            <div onClick={(e) => { e.preventDefault(); if (event.author.profile?.picture) openLightbox(event.author.profile.picture); }} style={{ cursor: 'pointer' }}>
                <img src={event.author.profile?.picture || "https://via.placeholder.com/50"} alt="" className="feed-user-pic" />
            </div>
            <div className="feed-content">
                <div className="feed-header-line">
                    <Link to={`/p/${event.author.profile?.nip05 || event.author.profile?.name || event.pubkey}`} className="feed-user-name">
                        {event.author.profile?.name || event.pubkey.slice(0, 8)}
                    </Link>
                    {displayMood && <span className="feed-mood"> is <b>{displayMood}</b></span>}
                </div>
                <div className="feed-text">
                    <RichTextRenderer content={displayContent} />
                </div>
                <div className="feed-meta">
                    Posted {new Date(event.created_at! * 1000).toLocaleTimeString()}
                </div>

                <InteractionBar
                    event={event}
                    onCommentClick={() => setShowCommentForm(!showCommentForm)}
                />

                <div style={{ marginTop: '5px' }}>
                    <a href="#" onClick={(e) => { e.preventDefault(); setShowThread(!showThread); }} style={{ fontSize: '7.5pt', color: '#003399' }}>
                        {showThread ? 'Collapse thread' : 'Show thread'}
                    </a>
                </div>

                {showThread && (
                    <div className="comment-thread" style={{
                        marginTop: '10px',
                        paddingLeft: '15px',
                        borderLeft: '1px solid #ddd'
                    }}>
                        {loadingThread && <div style={{ fontSize: '7.5pt', fontStyle: 'italic' }}>Loading thread...</div>}
                        {comments.map(c => (
                            <div key={c.id} style={{
                                marginBottom: '15px',
                                borderBottom: '1px dotted #ccc',
                                paddingBottom: '10px'
                            }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                    <img
                                        src={c.author.profile?.picture || "https://via.placeholder.com/30"}
                                        style={{ width: '30px', height: '30px', flexShrink: 0 }}
                                        alt=""
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 'bold' }}>
                                            <Link to={`/p/${c.author.profile?.nip05 || c.author.profile?.name || c.pubkey}`} style={{ color: '#003399', textDecoration: 'none' }}>
                                                {c.author.profile?.name || c.pubkey.slice(0, 8)}
                                            </Link>
                                        </div>
                                        <div style={{ color: '#333' }}>
                                            <RichTextRenderer content={c.content} />
                                        </div>

                                        <InteractionBar
                                            event={c}
                                            onCommentClick={() => setActiveReplyId(activeReplyId === c.id ? null : c.id)}
                                        />

                                        {activeReplyId === c.id && (
                                            <div className="reply-form" style={{ marginTop: '10px', background: '#f0f0f0', padding: '8px' }}>
                                                <textarea
                                                    value={replyText}
                                                    onChange={(e) => setReplyText(e.target.value)}
                                                    placeholder={`Reply to ${c.author.profile?.name || 'user'}...`}
                                                    style={{ width: '100%', height: '40px', fontSize: '9pt', border: '1px solid #ccc' }}
                                                />
                                                <div style={{ textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => handlePostComment(c, replyText, false)}
                                                        disabled={isSubmitting}
                                                        style={{ fontSize: '8pt' }}
                                                    >
                                                        Post Reply
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {showCommentForm && (
                    <div className="feed-comment-form" style={{
                        marginTop: '8px',
                        padding: '8px',
                        background: '#f9f9f9',
                        border: '1px solid #ccc'
                    }}>
                        <textarea
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Write a comment..."
                            style={{
                                width: '100%',
                                height: '40px',
                                fontSize: '9pt',
                                marginBottom: '5px',
                                backgroundColor: '#fff',
                                color: '#000',
                                border: '1px solid #ccc',
                                padding: '4px'
                            }}
                        />
                        <div style={{ textAlign: 'right' }}>
                            <button
                                onClick={() => handlePostComment(event, commentText, true)}
                                disabled={isSubmitting}
                                style={{ fontSize: '8pt', padding: '2px 8px', cursor: 'pointer' }}
                            >
                                {isSubmitting ? 'Posting...' : 'Post Comment'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

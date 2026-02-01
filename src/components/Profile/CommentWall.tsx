import { useEffect, useState, useCallback } from 'react';
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { useNostr } from '../../context/NostrContext';
import { RichTextRenderer } from '../Shared/RichTextRenderer';
import { InteractionBar } from '../Shared/InteractionBar';
import './CommentWall.css';

interface CommentWallProps {
    pubkey: string;
}

export const CommentWall = ({ pubkey }: CommentWallProps) => {
    const { ndk, user, login } = useNostr();
    const [comments, setComments] = useState<NDKEvent[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchComments = useCallback(async () => {
        if (!ndk || !pubkey) return;
        setLoading(true);
        try {
            // Fetch top-level comments (events tagging this profile with p-tag)
            const filter: NDKFilter = { kinds: [1], '#p': [pubkey], limit: 40 };
            const events = await ndk.fetchEvents(filter);
            const eventsArray = Array.from(events);

            // Fetch replies to these comments (e-tags)
            if (eventsArray.length > 0) {
                const eventIds = eventsArray.map(e => e.id);
                const replyFilter: NDKFilter = { kinds: [1], '#e': eventIds };
                const replies = await ndk.fetchEvents(replyFilter);
                eventsArray.push(...Array.from(replies));
            }

            // De-duplicate and sort
            const uniqueEvents = Array.from(new Map(eventsArray.map(e => [e.id, e])).values())
                .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

            setComments(uniqueEvents);
            setLoading(false);

            // Background profile resolution
            uniqueEvents.forEach(event => {
                Promise.race([
                    event.author.fetchProfile(),
                    new Promise((_, reject) => setTimeout(() => reject('timeout'), 3000))
                ]).then(() => {
                    setComments(prev => [...prev]); // Trigger re-render
                }).catch(() => { });
            });
        } catch (err) {
            console.error("Failed to fetch comments:", err);
            setLoading(false);
        }
    }, [ndk, pubkey]);

    useEffect(() => {
        fetchComments();
    }, [fetchComments]);

    const handlePostTopLevel = async () => {
        if (!ndk || !user) {
            await login();
            return;
        }
        if (!newComment.trim()) return;

        setIsSubmitting(true);
        const event = new NDKEvent(ndk);
        event.kind = 1;
        event.content = newComment;
        event.tags = [['p', pubkey]];

        try {
            await event.publish();
            setComments([event, ...comments]);
            setNewComment('');
            alert("Comment posted!");
        } catch (e) {
            console.error("Failed to publish comment", e);
            alert("Failed to post comment");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePostReply = async (parentEvent: NDKEvent) => {
        if (!ndk || !user) {
            await login();
            return;
        }
        if (!replyText.trim()) return;

        setIsSubmitting(true);
        try {
            const reply = new NDKEvent(ndk);
            reply.kind = 1;
            reply.content = replyText;

            // NIP-10 Threading
            const rootId = parentEvent.tags.find(t => t[0] === 'e' && t[3] === 'root')?.[1] || parentEvent.id;
            reply.tags = [
                ['e', rootId, '', 'root'],
                ['e', parentEvent.id, '', 'reply'],
                ['p', parentEvent.pubkey],
                ['p', pubkey] // Ensure owner still gets notified
            ];

            await reply.publish();
            setComments(prev => [reply, ...prev]);
            setReplyText("");
            setActiveReplyId(null);
            alert("Reply posted!");
        } catch (error) {
            console.error("Failed to post reply:", error);
            alert("Failed to post reply");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Helper to organize comments into threads
    const topLevelComments = comments.filter(c => !c.tags.some(t => t[0] === 'e'));
    const getReplies = (parentId: string) => comments.filter(c => c.tags.some(t => t[0] === 'e' && t[1] === parentId)).sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

    const renderComment = (comment: NDKEvent, isReply = false) => (
        <tr key={comment.id} className={isReply ? "comment-reply-row" : "comment-row"}>
            <td className={`comment-author-col ${isReply ? 'reply' : ''}`}>
                <a href={`/p/${comment.pubkey}`} style={{ fontWeight: 'bold', fontSize: isReply ? '8pt' : '10pt' }}>
                    {comment.author?.profile?.name || comment.pubkey.slice(0, 8)}
                </a>
                <br />
                <img
                    src={comment.author?.profile?.image || 'https://via.placeholder.com/50'}
                    alt="User"
                    style={{ width: isReply ? '30px' : '50px', height: isReply ? '30px' : '50px', objectFit: 'cover', marginTop: '5px' }}
                />
            </td>
            <td className="comment-content-col">
                <div className="comment-date">
                    {new Date((comment.created_at || 0) * 1000).toLocaleString()}
                </div>
                <div className="comment-body">
                    <RichTextRenderer content={comment.content} />
                </div>

                <InteractionBar
                    event={comment}
                    onCommentClick={() => setActiveReplyId(activeReplyId === comment.id ? null : comment.id)}
                />

                {activeReplyId === comment.id && (
                    <div className="reply-form">
                        <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder={`Reply to ${comment.author?.profile?.name || 'user'}...`}
                            style={{ width: '100%', height: '40px', fontSize: '9pt' }}
                        />
                        <div style={{ textAlign: 'right', marginTop: '5px' }}>
                            <button onClick={() => handlePostReply(comment)} disabled={isSubmitting} style={{ fontSize: '8pt' }}>
                                Post Reply
                            </button>
                        </div>
                    </div>
                )}

                {/* Render nested replies */}
                {!isReply && getReplies(comment.id).length > 0 && (
                    <div className="nested-replies-container">
                        <table className="comments-table nested">
                            <tbody>
                                {getReplies(comment.id).map(r => renderComment(r, true))}
                            </tbody>
                        </table>
                    </div>
                )}
            </td>
        </tr>
    );

    return (
        <div className="comment-wall-container">
            <div className="comment-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 className="section-header" style={{ flexGrow: 1, margin: 0 }}>{comments.length} Comments</h3>
            </div>

            <div className="comment-form" id="post-comment">
                {user ? (
                    <>
                        <textarea
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Leave a comment..."
                        />
                        <button onClick={handlePostTopLevel} disabled={isSubmitting}>
                            {isSubmitting ? 'Posting...' : 'Post Comment'}
                        </button>
                    </>
                ) : (
                    <div onClick={() => login()} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                        Login to leave a comment
                    </div>
                )}
            </div>

            <div className="comments-list">
                {loading && comments.length === 0 && <div>Loading comments...</div>}

                <table className="comments-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                        {topLevelComments.map(comment => renderComment(comment))}
                    </tbody>
                </table>

                <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '8pt' }}>
                    <a href="#" onClick={(e) => { e.preventDefault(); fetchComments(); }}>Refresh Comments</a>
                </div>
            </div>
        </div>
    );
};


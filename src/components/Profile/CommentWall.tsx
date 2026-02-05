import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { useNostr } from '../../context/NostrContext';
import { uploadToBlossom } from '../../services/blossom';
import { useRef } from 'react';
import { RichTextRenderer } from '../Shared/RichTextRenderer';
import { InteractionBar } from '../Shared/InteractionBar';
import { Avatar } from '../Shared/Avatar';
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
  const [replyText, setReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<'comment' | 'reply' | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!ndk || !pubkey) return;
    setLoading(true);
    try {
      // 1. Fetch mentions/comments (tagged with p: [pubkey])
      const mentionFilter: NDKFilter = { kinds: [1], '#p': [pubkey], limit: 40 };
      const mentions = await ndk.fetchEvents(mentionFilter);

      // 2. Fetch personal posts (authored by [pubkey])
      const authorFilter: NDKFilter = { kinds: [1], authors: [pubkey], limit: 40 };
      const posts = await ndk.fetchEvents(authorFilter);

      // Combine arrays
      const eventsArray = [...Array.from(mentions), ...Array.from(posts)];

      // 3. Fetch replies to these events (e-tags)
      if (eventsArray.length > 0) {
        const eventIds = eventsArray.map((e) => e.id);
        const replyFilter: NDKFilter = { kinds: [1], '#e': eventIds };
        const replies = await ndk.fetchEvents(replyFilter);
        eventsArray.push(...Array.from(replies));
      }

      // De-duplicate and sort (newest first)
      const uniqueEvents = Array.from(new Map(eventsArray.map((e) => [e.id, e])).values()).sort(
        (a, b) => (b.created_at || 0) - (a.created_at || 0)
      );

      setComments(uniqueEvents);
      setLoading(false);

      // Background profile resolution
      uniqueEvents.forEach((event) => {
        Promise.race([
          event.author.fetchProfile(),
          new Promise((_, reject) => setTimeout(() => reject('timeout'), 3000)),
        ])
          .then(() => {
            setComments((prev) => [...prev]); // Trigger re-render
          })
          .catch(() => { });
      });
    } catch (err) {
      console.error('Failed to fetch comments:', err);
      setLoading(false);
    }
  }, [ndk, pubkey]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ndk) return;

    setIsUploading(true);
    try {
      const result = await uploadToBlossom(ndk, file);
      const url = result.url;

      if (uploadTarget === 'comment') {
        setNewComment((prev) => (prev ? `${prev}\n${url}` : url));
      } else if (uploadTarget === 'reply') {
        setReplyText((prev) => (prev ? `${prev}\n${url}` : url));
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload image');
    } finally {
      setIsUploading(false);
      setUploadTarget(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerUpload = (target: 'comment' | 'reply') => {
    setUploadTarget(target);
    fileInputRef.current?.click();
  };

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
    event.tags = [
      ['p', pubkey],
      ['client', 'MyNostrSpace'],
    ];

    try {
      await event.publish();
      event.author = user; // Ensure profile renders immediately
      setComments([event, ...comments]);
      setNewComment('');
    } catch (e) {
      console.error('Failed to publish comment', e);
      alert('Failed to post comment');
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
      const rootId =
        parentEvent.tags.find((t) => t[0] === 'e' && t[3] === 'root')?.[1] || parentEvent.id;
      reply.tags = [
        ['e', rootId, '', 'root'],
        ['e', parentEvent.id, '', 'reply'],
        ['p', parentEvent.pubkey],
        ['p', pubkey], // Ensure owner still gets notified
        ['client', 'MyNostrSpace'],
      ];

      await reply.publish();
      reply.author = user; // Ensure profile renders immediately
      setComments((prev) => [reply, ...prev]);
      setReplyText('');
      setActiveReplyId(null);
    } catch (error) {
      console.error('Failed to post reply:', error);
      alert('Failed to post reply');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to organize comments into threads
  const topLevelComments = comments.filter((c) => !c.tags.some((t) => t[0] === 'e'));
  const getReplies = (parentId: string) =>
    comments
      .filter((c) => c.tags.some((t) => t[0] === 'e' && t[1] === parentId))
      .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

  const renderComment = (comment: NDKEvent, isReply = false) => (
    <div key={comment.id} className={`comment-item ${isReply ? 'comment-reply' : ''}`}>
      <div className="comment-left">
        <Link to={`/p/${comment.pubkey}`}>
          <Avatar
            pubkey={comment.pubkey}
            src={comment.author?.profile?.image}
            size={isReply ? 40 : 60}
            className="comment-user-pic"
          />
        </Link>
      </div>
      <div className="comment-right">
        <div className="comment-header-line">
          <Link to={`/p/${comment.pubkey}`} className="comment-author-name">
            {comment.author?.profile?.name || comment.pubkey.slice(0, 8)}
          </Link>
          <span className="comment-date">
            {new Date((comment.created_at || 0) * 1000).toLocaleString()}
          </span>
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
              className="nostr-input"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  handlePostReply(comment);
                }
              }}
              placeholder={`Reply to ${comment.author?.profile?.name || 'user'}...`}
            />
            <div style={{ textAlign: 'right', marginTop: '5px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => triggerUpload('reply')}
                disabled={isUploading || isSubmitting}
                style={{
                  fontSize: '8pt',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#003399',
                  textDecoration: 'underline',
                }}
              >
                Add Photo
              </button>
              <button
                onClick={() => handlePostReply(comment)}
                disabled={isSubmitting || isUploading}
                style={{ fontSize: '8pt' }}
              >
                Post Reply
              </button>
            </div>
          </div>
        )}

        {/* Render nested replies */}
        {!isReply && getReplies(comment.id).length > 0 && (
          <div className="nested-replies-container">
            {getReplies(comment.id).map((r) => renderComment(r, true))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="comment-wall-container">
      <div
        className="comment-header-row"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
        }}
      >
        <h3 className="section-header" style={{ flexGrow: 1, margin: 0 }}>
          Comments & Activity
        </h3>
      </div>

      <div className="comment-form-box">
        <div className="comment-form-header">Post a Comment</div>
        <div className="comment-form-body">
          {user ? (
            <>
              <textarea
                className="nostr-input"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    handlePostTopLevel();
                  }
                }}
                placeholder="Leave a comment..."
              />
              <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => triggerUpload('comment')}
                  disabled={isUploading || isSubmitting}
                  style={{
                    fontSize: '8pt',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#003399',
                    textDecoration: 'underline',
                  }}
                >
                  Add Photo
                </button>
                <button
                  className="post-comment-btn"
                  onClick={handlePostTopLevel}
                  disabled={isSubmitting || isUploading}
                >
                  {isSubmitting ? 'Posting...' : 'Post Comment'}
                </button>
              </div>
            </>
          ) : (
            <div
              onClick={() => login()}
              style={{
                cursor: 'pointer',
                textDecoration: 'underline',
                textAlign: 'center',
                padding: '10px',
              }}
            >
              Login to leave a comment
            </div>
          )}
        </div>
      </div>

      <div className="comments-list">
        {loading && comments.length === 0 && <div>Loading comments...</div>}

        <div className="comments-items-wrapper">
          {topLevelComments.map((comment) => renderComment(comment))}
        </div>

        <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '8pt' }}>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              fetchComments();
            }}
          >
            Refresh Comments
          </a>
        </div>
      </div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />
    </div>
  );
};

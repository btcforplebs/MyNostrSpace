import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import './FeedItem.css';
import { NDKEvent, type NDKFilter, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { RichTextRenderer } from './RichTextRenderer';
import { InteractionBar } from './InteractionBar';
import { useNostr } from '../../context/NostrContext';
import { uploadToBlossom } from '../../services/blossom';
import { useEffect, useCallback, useRef } from 'react';
import { useProfile } from '../../hooks/useProfile';
import { Avatar } from './Avatar';
import { isBlockedUser, hasBlockedKeyword } from '../../utils/blockedUsers';
import { MentionInput } from './MentionInput';
import { extractMentions } from '../../utils/mentions';

interface ThreadNode {
  event: NDKEvent;
  children: ThreadNode[];
}

interface ThreadedCommentsProps {
  rootEvent: NDKEvent;
  comments: NDKEvent[];
  loadingThread: boolean;
  activeReplyId: string | null;
  setActiveReplyId: (id: string | null) => void;
  replyText: string;
  setReplyText: (text: string) => void;
  triggerUpload: (target: 'reply') => void;
  handlePostComment: (parent: NDKEvent, text: string, isTopLevel: boolean) => Promise<void>;
  isUploading: boolean;
  isSubmitting: boolean;
}

const ThreadedComments: React.FC<ThreadedCommentsProps> = ({
  rootEvent,
  comments,
  loadingThread,
  activeReplyId,
  setActiveReplyId,
  replyText,
  setReplyText,
  triggerUpload,
  handlePostComment,
  isUploading,
  isSubmitting,
}) => {
  // Build tree only when comments change
  const buildTree = useCallback(
    (events: NDKEvent[]): ThreadNode[] => {
      const buildNode = (parentId: string): ThreadNode[] => {
        const children = events
          .filter((ev) => {
            const eTags = ev.tags.filter((t: string[]) => t[0] === 'e');
            const replyMarker = eTags.find((t: string[]) => t[3] === 'reply');
            const rootMarker = eTags.find((t: string[]) => t[3] === 'root');

            let directParentId = null;
            if (replyMarker) {
              directParentId = replyMarker[1];
            } else if (rootMarker) {
              const otherTags = eTags.filter((t: string[]) => t[3] !== 'root');
              if (otherTags.length > 0) directParentId = otherTags[otherTags.length - 1][1];
              else directParentId = rootMarker[1];
            } else {
              if (eTags.length > 0) directParentId = eTags[eTags.length - 1][1];
            }

            return directParentId === parentId;
          })
          .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

        return children.map((child) => ({
          event: child,
          children: buildNode(child.id),
        }));
      };

      return buildNode(rootEvent.id);
    },
    [rootEvent.id]
  );

  const threadTree = useMemo(() => buildTree(comments), [comments, buildTree]);

  const renderThread = (nodes: ThreadNode[], depth: number = 0) => {
    return nodes.map((node) => (
      <div key={node.event.id} style={{ marginBottom: '10px' }}>
        <div
          style={{
            marginLeft: depth > 0 ? '20px' : '0',
            borderLeft: depth > 0 ? '2px solid #ddd' : 'none',
            paddingLeft: depth > 0 ? '10px' : '0',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <Avatar
              pubkey={node.event.pubkey}
              src={node.event.author.profile?.picture}
              size={30}
              style={{ flexShrink: 0 }}
            />
            <div style={{ flex: 1 }}>
              <div className="comment-header">
                <Link to={`/p/${node.event.pubkey}`} className="comment-author-name">
                  {node.event.author.profile?.name ||
                    node.event.author.profile?.displayName ||
                    node.event.author.profile?.display_name ||
                    node.event.pubkey.slice(0, 8)}
                </Link>
                <span className="comment-date">
                  {new Date((node.event.created_at || 0) * 1000).toLocaleString()}
                </span>
              </div>
              <div style={{ color: '#333', fontSize: '9pt', lineHeight: 1.4 }}>
                <RichTextRenderer content={node.event.content} />
              </div>

              <InteractionBar
                event={node.event}
                onCommentClick={() =>
                  setActiveReplyId(activeReplyId === node.event.id ? null : node.event.id)
                }
                commentCount={node.children.length}
              />

              {activeReplyId === node.event.id && (
                <div className="reply-form myspace-form-container">
                  <MentionInput
                    className="nostr-input"
                    value={replyText}
                    setValue={setReplyText}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        handlePostComment(node.event, replyText, false);
                      }
                    }}
                    placeholder={`Reply to ${node.event.author.profile?.name || 'user'}...`}
                  />
                  <div className="myspace-button-group">
                    <button
                      type="button"
                      className="myspace-button-secondary"
                      onClick={() => triggerUpload('reply')}
                      disabled={isUploading || isSubmitting}
                    >
                      Add Photo
                    </button>
                    <button
                      className="myspace-button"
                      onClick={() => handlePostComment(node.event, replyText, false)}
                      disabled={isSubmitting || isUploading}
                    >
                      Post Reply
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {node.children.length > 0 && renderThread(node.children, depth + 1)}
      </div>
    ));
  };

  return (
    <div
      className="comment-thread"
      style={{
        marginTop: '10px',
        paddingLeft: '15px',
        borderLeft: '1px solid #ddd',
      }}
    >
      {loadingThread && (
        <div style={{ fontSize: '7.5pt', fontStyle: 'italic' }}>Loading thread...</div>
      )}
      {renderThread(threadTree)}
    </div>
  );
};

interface FeedItemProps {
  event: NDKEvent;
  hideThreadButton?: boolean;
}

const FeedItemInner: React.FC<FeedItemProps> = ({ event, hideThreadButton = false }) => {
  const { ndk, user, login } = useNostr();
  const { profile } = useProfile(event.pubkey);

  const isBlocked = useMemo(() => {
    return isBlockedUser(event.pubkey) || hasBlockedKeyword(event.content);
  }, [event.pubkey, event.content]);

  const wallRecipientTag = useMemo(() => {
    const pTags = event.tags.filter((t: string[]) => t[0] === 'p');
    const eTags = event.tags.filter((t: string[]) => t[0] === 'e');
    // Wall post: Kind 1, No e-tags, exactly 1 p-tag (standard wall post pattern in this client)
    // Only show if the recipient is NOT the author
    if (
      event.kind === 1 &&
      eTags.length === 0 &&
      pTags.length === 1 &&
      pTags[0][1] !== event.pubkey
    ) {
      return pTags[0][1];
    }
    return null;
  }, [event]);

  const { profile: recipientProfile } = useProfile(wallRecipientTag || undefined);

  const [showCommentForm, setShowCommentForm] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [comments, setComments] = useState<NDKEvent[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<'comment' | 'reply' | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Parse embedded repost content synchronously to avoid "Loading..." flash
  const [repostEvent, setRepostEvent] = useState<NDKEvent | null>(() => {
    if (event.kind === 6 && ndk && event.content) {
      const trimmed = event.content.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          // Sanitize the JSON string to remove invalid control characters
          const sanitized = trimmed.replace(/[\x00-\x1F\x7F]/g, (char) => {
            // Keep newlines and tabs but remove other control characters
            if (char === '\n' || char === '\t') return char;
            return '';
          });
          return new NDKEvent(ndk, JSON.parse(sanitized));
        } catch {
          /* ignore parse error */
        }
      }
    }
    return null;
  });

  useEffect(() => {
    // Only fetch from relay if embedded content wasn't available
    if (event.kind === 6 && ndk && !repostEvent) {
      const targetId = event.tags.find((t: string[]) => t[0] === 'e')?.[1];
      if (!targetId) return;
      ndk
        .fetchEvent(targetId)
        .then((ev) => {
          if (ev) setRepostEvent(ev);
        })
        .catch((error) => {
          console.error('Failed to fetch reposted event:', error);
        });
    }
  }, [event, ndk, repostEvent]);

  const fetchThread = useCallback(async () => {
    if (!ndk) return;
    setLoadingThread(true);
    try {
      const filter: NDKFilter = {
        kinds: [1],
        '#e': [event.id],
      };

      // Use subscribe with a timeout instead of fetchEvents for better relay connectivity
      const commentsRef = new Map<string, NDKEvent>();
      const sub = ndk.subscribe(filter, {
        closeOnEose: true,
        cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
      });

      sub.on('event', (reply: NDKEvent) => {
        if (!commentsRef.has(reply.id)) {
          commentsRef.set(reply.id, reply);
          // Fetch profile in background
          reply.author.fetchProfile().catch(() => { });
        }
      });

      // Wait for EOSE or timeout
      await new Promise<void>((resolve) => {
        const timeoutId = setTimeout(() => {
          sub.stop();
          resolve();
        }, 5000); // 5 second timeout

        sub.on('eose', () => {
          clearTimeout(timeoutId);
          sub.stop();
          resolve();
        });
      });

      const sortedResults = Array.from(commentsRef.values()).sort(
        (a, b) => (a.created_at || 0) - (b.created_at || 0)
      );
      setComments(sortedResults);
    } catch (error) {
      console.error('Failed to fetch thread:', error);
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
  const displayMood = moodMatch
    ? moodMatch[1]
    : event.tags.find((t: string[]) => t[0] === 'mood')?.[1] || null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ndk) return;

    setIsUploading(true);
    try {
      const result = await uploadToBlossom(ndk, file);
      const url = result.url;

      if (uploadTarget === 'comment') {
        setCommentText((prev) => (prev ? `${prev}\n${url}` : url));
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
      const rootId = isTopLevel
        ? parentEvent.id
        : parentEvent.tags.find((t) => t[0] === 'e' && t[3] === 'root')?.[1] || parentEvent.id;


      const replyTags: string[][] = [];

      // NIP-10: Root tag
      replyTags.push(['e', rootId, '', 'root']);

      // NIP-10: Reply tag (only if parent is NOT the root)
      if (parentEvent.id !== rootId) {
        replyTags.push(['e', parentEvent.id, '', 'reply']);
      }

      // Extract mentions
      const mentionedPubkeys = extractMentions(text);
      const mentionTags = mentionedPubkeys.map((pubkey) => ['p', pubkey]);

      reply.tags = [
        ...replyTags,
        ['p', parentEvent.pubkey],
        ...mentionTags,
        ['client', 'MyNostrSpace'],
      ];

      await reply.publish();

      if (isTopLevel) {
        setCommentText('');
        setShowCommentForm(false);
      } else {
        setReplyText('');
        setActiveReplyId(null);
      }

      // Add to local state so it appears immediately
      // Explicitly set the author to the current user so profile data is available immediately
      reply.author = user;
      setComments((prev) => [...prev, reply]);
      setShowThread(true);
    } catch (error) {
      console.error('Failed to post comment:', error);
      alert('Failed to post comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isBlocked) return null;

  if (event.kind === 6) {
    return (
      <div className="feed-item repost-item" style={{ flexDirection: 'column', gap: '5px' }}>
        <div
          className="repost-header"
          style={{
            fontSize: '8pt',
            color: '#666',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <Avatar
            pubkey={event.pubkey}
            src={profile?.picture}
            size={16}
            style={{ width: '16px', height: '16px', border: 'none' }}
          />
          <Link
            to={`/p/${event.pubkey}`}
            style={{ color: '#666', fontWeight: 'bold', textDecoration: 'none' }}
          >
            {profile?.name || event.pubkey.slice(0, 8)}
          </Link>
          <span>reposted</span>
        </div>
        {repostEvent ? (
          <FeedItem event={repostEvent} />
        ) : (
          <div
            className="repost-loading"
            style={{
              padding: '10px',
              fontSize: '9pt',
              fontStyle: 'italic',
              color: '#888',
            }}
          >
            Loading reposted content...
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="feed-item">
      <Link
        to={`/p/${event.pubkey}`}
        style={{ cursor: 'pointer', textDecoration: 'none', alignSelf: 'flex-start' }}
      >
        <Avatar pubkey={event.pubkey} src={profile?.picture} className="feed-user-pic" size={60} />
      </Link>
      <div className="feed-content">
        <div className="feed-header-line">
          <div className="feed-header-names">
            <Link to={`/p/${event.pubkey}`} className="feed-user-name">
              {profile?.name ||
                profile?.displayName ||
                profile?.display_name ||
                event.pubkey.slice(0, 8)}
            </Link>
            {wallRecipientTag && (
              <>
                <span className="feed-wall-arrow"> -&gt; </span>
                <Link to={`/p/${wallRecipientTag}`} className="feed-user-name">
                  {recipientProfile?.name ||
                    recipientProfile?.displayName ||
                    recipientProfile?.display_name ||
                    wallRecipientTag.slice(0, 8)}
                </Link>
              </>
            )}
          </div>
          {displayMood && (
            <span className="feed-mood">
              {' '}
              is <b>{displayMood}</b>
            </span>
          )}
        </div>
        <div className="feed-text">
          {event.kind === 30023 ? (
            <div className="blog-post-card" style={{
              padding: '12px',
              border: '1px solid #6699cc',
              borderRadius: '4px',
              background: '#f0f5ff',
              marginTop: '5px'
            }}>
              <div style={{ fontWeight: 'bold', fontSize: '11pt', marginBottom: '8px', color: '#003399' }}>
                ✍️ {event.tags.find(t => t[0] === 'title')?.[1] || 'Untitled Blog Post'}
              </div>
              <div style={{ fontSize: '9pt', color: '#444', lineHeight: '1.4', marginBottom: '10px' }}>
                {event.content.slice(0, 180)}...
              </div>
              <Link
                to={`/blog/${event.pubkey}/${event.tags.find(t => t[0] === 'd')?.[1]}`}
                className="myspace-button"
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  fontSize: '8pt',
                  textDecoration: 'none'
                }}
              >
                Read Full Article
              </Link>
            </div>
          ) : (
            <RichTextRenderer content={displayContent} />
          )}
        </div>
        <div className="feed-meta">
          Posted {new Date(event.created_at! * 1000).toLocaleDateString()}{' '}
          {new Date(event.created_at! * 1000).toLocaleTimeString()}
        </div>

        <InteractionBar
          event={event}
          onCommentClick={() => setShowCommentForm(!showCommentForm)}
          commentCount={comments.length}
        />

        {!hideThreadButton && (
          <div style={{ marginTop: '5px' }}>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setShowThread(!showThread);
              }}
              style={{ fontSize: '7.5pt', color: '#003399' }}
            >
              {showThread ? 'Collapse thread' : 'Show thread'}
            </a>
            {showThread && (
              <span style={{ marginLeft: '10px' }}>
                <Link to={`/thread/${event.id}`} style={{ fontSize: '7.5pt', color: '#003399' }}>
                  View full thread
                </Link>
              </span>
            )}
          </div>
        )}

        {showThread && (
          <ThreadedComments
            rootEvent={event}
            comments={comments}
            loadingThread={loadingThread}
            activeReplyId={activeReplyId}
            setActiveReplyId={setActiveReplyId}
            replyText={replyText}
            setReplyText={setReplyText}
            triggerUpload={triggerUpload}
            handlePostComment={handlePostComment}
            isUploading={isUploading}
            isSubmitting={isSubmitting}
          />
        )}

        {showCommentForm && (
          <div className="feed-comment-form myspace-form-container">
            <MentionInput
              className="nostr-input"
              value={commentText}
              setValue={setCommentText}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  handlePostComment(event, commentText, true);
                }
              }}
              placeholder="Write a comment..."
            />
            <div className="myspace-button-group">
              <button
                type="button"
                className="myspace-button-secondary"
                onClick={() => triggerUpload('comment')}
                disabled={isUploading || isSubmitting}
              >
                Add Photo
              </button>
              <button
                className="myspace-button"
                onClick={() => handlePostComment(event, commentText, true)}
                disabled={isSubmitting || isUploading}
              >
                {isSubmitting ? 'Posting...' : 'Post Comment'}
              </button>
            </div>
          </div>
        )}
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

// Memoize to prevent re-renders when parent state changes but event is same
export const FeedItem = React.memo(FeedItemInner, (prev, next) => {
  return prev.event.id === next.event.id && prev.hideThreadButton === next.hideThreadButton;
});

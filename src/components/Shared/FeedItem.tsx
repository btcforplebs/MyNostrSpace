import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { RichTextRenderer } from './RichTextRenderer';
import { InteractionBar } from './InteractionBar';
import { useNostr } from '../../context/NostrContext';
import { useEffect, useCallback } from 'react';
import { useProfile } from '../../hooks/useProfile';
import { Avatar } from './Avatar';

interface FeedItemProps {
  event: NDKEvent;
}

export const FeedItem: React.FC<FeedItemProps> = ({ event }) => {
  const { ndk, user, login } = useNostr();
  const { profile } = useProfile(event.pubkey);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [comments, setComments] = useState<NDKEvent[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  // Parse embedded repost content synchronously to avoid "Loading..." flash
  const [repostEvent, setRepostEvent] = useState<NDKEvent | null>(() => {
    if (event.kind === 6 && ndk && event.content) {
      const trimmed = event.content.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return new NDKEvent(ndk, JSON.parse(trimmed));
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
      const targetId = event.tags.find((t) => t[0] === 'e')?.[1];
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
      const results = await ndk.fetchEvents(filter);
      const sortedResults = Array.from(results).sort(
        (a, b) => (a.created_at || 0) - (b.created_at || 0)
      );
      // Fetch profiles for authors
      await Promise.all(sortedResults.map((e) => e.author.fetchProfile()));
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
    : event.tags.find((t) => t[0] === 'mood')?.[1] || null;

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

      reply.tags = [
        ['e', rootId, '', 'root'],
        ['e', parentEvent.id, '', 'reply'],
        ['p', parentEvent.pubkey],
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
      setComments((prev) => [...prev, reply]);
      setShowThread(true);
      alert('Comment posted!');
    } catch (error) {
      console.error('Failed to post comment:', error);
      alert('Failed to post comment');
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <span style={{ fontSize: '10pt' }}>🔄</span>
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
          <Link to={`/p/${event.pubkey}`} className="feed-user-name">
            {profile?.name ||
              profile?.displayName ||
              profile?.display_name ||
              event.pubkey.slice(0, 8)}
          </Link>
          {displayMood && (
            <span className="feed-mood">
              {' '}
              is <b>{displayMood}</b>
            </span>
          )}
        </div>
        <div className="feed-text">
          <RichTextRenderer content={displayContent} />
        </div>
        <div className="feed-meta">
          Posted {new Date(event.created_at! * 1000).toLocaleTimeString()}
        </div>

        <InteractionBar event={event} onCommentClick={() => setShowCommentForm(!showCommentForm)} />

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
        </div>

        {showThread && (
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
            {comments.map((c) => (
              <div
                key={c.id}
                style={{
                  marginBottom: '15px',
                  borderBottom: '1px dotted #ccc',
                  paddingBottom: '10px',
                }}
              >
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <Avatar
                    pubkey={c.pubkey}
                    src={c.author.profile?.picture}
                    size={30}
                    style={{ flexShrink: 0 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold' }}>
                      <Link
                        to={`/p/${c.pubkey}`}
                        style={{ color: '#003399', textDecoration: 'none' }}
                      >
                        {c.author.profile?.name ||
                          c.author.profile?.displayName ||
                          c.author.profile?.display_name ||
                          c.pubkey.slice(0, 8)}
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
                      <div
                        className="reply-form"
                        style={{ marginTop: '10px', background: '#f0f0f0', padding: '8px' }}
                      >
                        <textarea
                          className="nostr-input"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder={`Reply to ${c.author.profile?.name || 'user'}...`}
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
          <div
            className="feed-comment-form"
            style={{
              marginTop: '8px',
              padding: '8px',
              background: '#f9f9f9',
              border: '1px solid #ccc',
            }}
          >
            <textarea
              className="nostr-input"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment..."
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

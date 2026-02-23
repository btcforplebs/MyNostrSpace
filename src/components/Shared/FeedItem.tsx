import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './FeedItem.css';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { RichTextRenderer } from './RichTextRenderer';
import { InteractionBar } from './InteractionBar';
import { useNostr } from '../../context/NostrContext';
import { uploadToBlossom } from '../../services/blossom';
import { useProfile } from '../../hooks/useProfile';
import { Avatar } from './Avatar';
import { isBlockedUser, hasBlockedKeyword } from '../../utils/blockedUsers';
import { MentionInput } from './MentionInput';
import { extractMentions } from '../../utils/mentions';

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
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Compute bech32 note1 ID for the thread link — enables ThreadPage bech32 support
  const noteId = useMemo(() => {
    try {
      return nip19.noteEncode(event.id);
    } catch {
      return event.id;
    }
  }, [event.id]);

  // Parse embedded repost content synchronously to avoid "Loading..." flash
  const [repostEvent, setRepostEvent] = useState<NDKEvent | null>(() => {
    if (event.kind === 6 && ndk && event.content) {
      const trimmed = event.content.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const sanitized = trimmed.replace(/[\x00-\x1F\x7F]/g, (char) => {
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
      setCommentText((prev) => (prev ? `${prev}\n${url}` : url));
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload image');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePostComment = async (parentEvent: NDKEvent, text: string) => {
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

      const mentionedPubkeys = extractMentions(text);
      const mentionTags = mentionedPubkeys.map((pubkey) => ['p', pubkey]);

      reply.tags = [
        ['e', parentEvent.id, '', 'root'],
        ['p', parentEvent.pubkey],
        ...mentionTags,
        ['client', 'MyNostrSpace'],
      ];

      await reply.publish();
      setCommentText('');
      setShowCommentForm(false);
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
            <div
              className="blog-post-card"
              style={{
                padding: '12px',
                border: '1px solid #6699cc',
                borderRadius: '4px',
                background: '#f0f5ff',
                marginTop: '5px',
              }}
            >
              <div
                style={{
                  fontWeight: 'bold',
                  fontSize: '11pt',
                  marginBottom: '8px',
                  color: '#003399',
                }}
              >
                ✍️ {event.tags.find((t) => t[0] === 'title')?.[1] || 'Untitled Blog Post'}
              </div>
              <div
                style={{
                  fontSize: '9pt',
                  color: '#444',
                  lineHeight: '1.4',
                  marginBottom: '10px',
                }}
              >
                {event.content.slice(0, 180)}...
              </div>
              <Link
                to={`/blog/${event.pubkey}/${event.tags.find((t) => t[0] === 'd')?.[1]}`}
                className="myspace-button"
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  fontSize: '8pt',
                  textDecoration: 'none',
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
          commentCount={0}
        />

        {!hideThreadButton && (
          <div style={{ marginTop: '5px' }}>
            <Link to={`/thread/${noteId}`} style={{ fontSize: '7.5pt', color: '#003399' }}>
              View full thread
            </Link>
          </div>
        )}

        {showCommentForm && (
          <div className="feed-comment-form myspace-form-container">
            <MentionInput
              className="nostr-input"
              value={commentText}
              setValue={setCommentText}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  handlePostComment(event, commentText);
                }
              }}
              placeholder="Write a comment..."
            />
            <div className="myspace-button-group">
              <button
                type="button"
                className="myspace-button-secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isSubmitting}
              >
                Add Photo
              </button>
              <button
                className="myspace-button"
                onClick={() => handlePostComment(event, commentText)}
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

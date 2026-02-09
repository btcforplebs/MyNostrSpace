/**
 * MessageItem Component
 * Displays a single message bubble in a conversation
 */

import { useMemo } from 'react';
import { useProfile } from '../../hooks/useProfile';
import { formatMessageTime } from '../../hooks/useConversations';
import type { CachedDMMessage } from '../../services/messageCache';
import './MessageItem.css';

interface MessageItemProps {
  message: CachedDMMessage;
}

export const MessageItem = ({ message }: MessageItemProps) => {
  const { profile } = useProfile(message.senderPubkey);

  const displayName = useMemo(() => {
    if (profile?.name) return profile.name;
    return message.senderPubkey.slice(0, 12) + '...';
  }, [profile, message.senderPubkey]);

  const formattedTime = formatMessageTime(message.originalTimestamp);

  return (
    <div className={`message-item ${message.isOutgoing ? 'outgoing' : 'incoming'}`}>
      {!message.isOutgoing && (
        <img
          src={
            profile?.image ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${message.senderPubkey}`
          }
          alt={displayName}
          className="message-avatar"
          loading="lazy"
        />
      )}

      <div className="message-bubble-container">
        {!message.isOutgoing && <div className="message-sender-name">{displayName}</div>}
        <div className="message-bubble">
          <p className="message-content">{message.content}</p>
          <div className="message-timestamp">{formattedTime}</div>
        </div>
      </div>

      {message.isOutgoing && (
        <img
          src={
            profile?.image ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${message.senderPubkey}`
          }
          alt={displayName}
          className="message-avatar"
          loading="lazy"
        />
      )}
    </div>
  );
};

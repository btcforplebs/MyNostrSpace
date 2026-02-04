import { Link } from 'react-router-dom';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useProfile } from '../../hooks/useProfile';

interface ChatMessageProps {
  msg: NDKEvent;
}

export const ChatMessage = ({ msg }: ChatMessageProps) => {
  const { profile } = useProfile(msg.pubkey);

  // Format time
  const timeString = new Date((msg.created_at || 0) * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Determine display name
  // 1. Profile name/display_name
  // 2. Author.profile (if cached on event object)
  // 3. Pubkey truncation
  const displayName =
    profile?.name ||
    profile?.display_name ||
    msg.author?.profile?.name ||
    msg.author?.profile?.display_name ||
    msg.pubkey.slice(0, 8);

  return (
    <div className="chat-message">
      <span className="chat-author">
        <Link
          to={`/p/${msg.pubkey}`}
          style={{ color: '#003399', textDecoration: 'none', fontWeight: 'bold' }}
        >
          {displayName}
        </Link>
        :
      </span>
      <span className="chat-text" style={{ marginLeft: '4px' }}>
        {msg.content}
      </span>
      <span className="chat-time" style={{ color: '#999', fontSize: '0.8em', marginLeft: '6px' }}>
        ({timeString})
      </span>
    </div>
  );
};

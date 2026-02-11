import { Link } from 'react-router-dom';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useProfile } from '../../hooks/useProfile';
import { useMemo } from 'react';

interface ChatMessageProps {
  msg: NDKEvent;
}

export const ChatMessage = ({ msg }: ChatMessageProps) => {
  // If it's a zap, we want to show the zapper's profile, not the relay's
  const zapperInfo = useMemo(() => {
    if (msg.kind !== 9735) return null;

    try {
      // 1. Try to get amount from the zap receipt's own tags (sometimes relays add it)
      const receiptAmountTag = msg.getMatchingTags('amount')[0]?.[1];
      let amount = receiptAmountTag ? parseInt(receiptAmountTag) / 1000 : 0;

      const description = msg.getMatchingTags('description')[0]?.[1];
      if (!description) {
        return {
          pubkey: msg.pubkey, // Fallback to event pubkey if no request found
          amount: amount,
          content: '',
        };
      }

      const zapRequest = new NDKEvent(msg.ndk, JSON.parse(description));

      // 2. If amount is still 0, try the zap request's amount tag
      if (amount === 0) {
        const amountTag = zapRequest.getMatchingTags('amount')[0]?.[1];
        amount = amountTag ? parseInt(amountTag) / 1000 : 0;
      }

      const content = zapRequest.content;
      const zapperPubkey = zapRequest.pubkey;

      return {
        pubkey: zapperPubkey,
        amount,
        content,
      };
    } catch (e) {
      console.error('Failed to parse zap receipt', e);
      return null;
    }
  }, [msg]);

  const displayPubkey = zapperInfo ? zapperInfo.pubkey : msg.pubkey;
  const { profile } = useProfile(displayPubkey);

  // Format time
  const timeString = new Date((msg.created_at || 0) * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Determine display name
  const displayName = String(
    profile?.name ||
      profile?.display_name ||
      msg.author?.profile?.name ||
      msg.author?.profile?.display_name ||
      displayPubkey.slice(0, 8)
  );

  // Get profile picture
  const profilePicture = String(
    profile?.picture ||
      profile?.image ||
      (zapperInfo ? '' : msg.author?.profile?.picture || msg.author?.profile?.image) ||
      `https://robohash.org/${displayPubkey}`
  );

  if (zapperInfo) {
    return (
      <div
        className="chat-message zap-message"
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-start',
          marginBottom: '10px',
          background: 'rgba(255, 215, 0, 0.1)',
          padding: '8px',
          border: '1px solid #ffd700',
          borderRadius: '4px',
        }}
      >
        <Link to={`/p/${zapperInfo.pubkey}`} style={{ flexShrink: 0 }}>
          <img
            src={profilePicture}
            alt={displayName}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1px solid #ffd700',
            }}
            onError={(e) => {
              e.currentTarget.src = `https://robohash.org/${zapperInfo.pubkey}`;
            }}
          />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div>
            <span
              className="zap-badge"
              style={{
                background: '#ffd700',
                color: '#000',
                fontSize: '0.7rem',
                padding: '1px 4px',
                borderRadius: '2px',
                fontWeight: 'bold',
                marginRight: '6px',
              }}
            >
              ZAP {zapperInfo.amount} sats
            </span>
            <span className="chat-author">
              <Link
                to={`/p/${zapperInfo.pubkey}`}
                style={{ color: '#003399', textDecoration: 'none', fontWeight: 'bold' }}
              >
                {displayName}
              </Link>
            </span>
            <span
              className="chat-time"
              style={{ color: '#999', fontSize: '0.75em', marginLeft: '6px' }}
            >
              {timeString}
            </span>
          </div>
          {zapperInfo.content && (
            <div
              className="chat-text"
              style={{ wordBreak: 'break-word', fontStyle: 'italic', marginTop: '2px' }}
            >
              "{zapperInfo.content}"
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="chat-message"
      style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px' }}
    >
      <Link to={`/p/${msg.pubkey}`} style={{ flexShrink: 0 }}>
        <img
          src={profilePicture}
          alt={displayName}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            objectFit: 'cover',
            border: '1px solid #ccc',
          }}
          onError={(e) => {
            e.currentTarget.src = `https://robohash.org/${msg.pubkey}`;
          }}
        />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div>
          <span className="chat-author">
            <Link
              to={`/p/${msg.pubkey}`}
              style={{ color: '#003399', textDecoration: 'none', fontWeight: 'bold' }}
            >
              {displayName}
            </Link>
          </span>
          <span
            className="chat-time"
            style={{ color: '#999', fontSize: '0.75em', marginLeft: '6px' }}
          >
            {timeString}
          </span>
        </div>
        <div className="chat-text" style={{ wordBreak: 'break-word' }}>
          {msg.content}
        </div>
      </div>
    </div>
  );
};

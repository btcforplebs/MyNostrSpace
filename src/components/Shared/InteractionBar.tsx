import React, { useEffect, useState, useCallback } from 'react';
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { useNostr } from '../../context/NostrContext';

interface InteractionBarProps {
  event: NDKEvent;
  onCommentClick?: () => void;
}

export const InteractionBar: React.FC<InteractionBarProps> = ({ event, onCommentClick }) => {
  const { ndk, user, login } = useNostr();
  const [likes, setLikes] = useState(0);
  const [comments, setComments] = useState(0);
  const [zaps, setZaps] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [zapInvoice, setZapInvoice] = useState<string | null>(null);
  const [isZapping, setIsZapping] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!ndk) return;

    try {
      const filter: NDKFilter = {
        '#e': [event.id],
        kinds: [7, 1, 9735],
      };

      const relatedEvents = await ndk.fetchEvents(filter);

      let likeCount = 0;
      let commentCount = 0;
      let zapTotal = 0;
      let likedByMe = false;

      relatedEvents.forEach((e) => {
        if (e.kind === 7) {
          likeCount++;
          if (user && e.pubkey === user.pubkey) likedByMe = true;
        } else if (e.kind === 1) {
          // Simple check: if it tags our event with 'e', count as comment
          // We could be more strict with 'reply' marker but for now this is fine
          commentCount++;
        } else if (e.kind === 9735) {
          // Extract amount from zap invoice or tag if possible
          // For now, let's just count them or try to sum (simplified)
          zapTotal++;
        }
      });

      setLikes(likeCount);
      setComments(commentCount);
      setZaps(zapTotal);
      setIsLiked(likedByMe);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, [ndk, event.id, user]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      await login();
      return;
    }
    if (isLiked) return; // Already liked

    try {
      await event.react('+');
      setLikes((prev) => prev + 1);
      setIsLiked(true);
    } catch (error) {
      console.error('Failed to like:', error);
    }
  };

  const handleZap = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      await login();
      return;
    }

    const amount = prompt('Enter amount in sats to zap:', '21');
    if (!amount) return;

    setIsZapping(true);
    setZapInvoice(null);

    try {
      const amountInMSats = parseInt(amount) * 1000;
      if (isNaN(amountInMSats) || amountInMSats <= 0) {
        alert('Invalid amount');
        return;
      }

      console.log(`Initiating zap of ${amount} sats for event ${event.id}`);

      if (!event.author.profile) {
        await event.author.fetchProfile();
      }

      const profile = event.author.profile;
      const lud16 = profile?.lud16 || profile?.lud06;

      if (!lud16) {
        alert("This user hasn't set up a Lightning address (lud16).");
        return;
      }

      // Manual LNURL-Zap Flow
      // 1. Resolve LNURL/Lud16
      let lnurl = '';
      if (lud16.includes('@')) {
        const [name, domain] = lud16.split('@');
        lnurl = `https://${domain}/.well-known/lnurlp/${name}`;
      } else {
        // Simplified lud06 decoding (not full spec but common for now)
        lnurl = lud16;
      }

      const lnurlRes = await fetch(lnurl);
      const lnurlData = await lnurlRes.json();
      const callback = lnurlData.callback;

      if (!callback) {
        throw new Error('No callback found in LNURL data');
      }

      // 2. Create Zap Request (Kind 9734)
      const zapRequest = new NDKEvent(ndk);
      zapRequest.kind = 9734;
      zapRequest.content = 'Zap from MyNostrSpace';
      zapRequest.tags = [
        ['relays', ...ndk.pool.relays.keys()],
        ['amount', amountInMSats.toString()],
        ['lnurl', lud16], // Lud16 or encoded lnurl
        ['p', event.author.pubkey],
        ['e', event.id],
      ];

      await zapRequest.sign();
      const zapRequestJson = JSON.stringify(zapRequest.rawEvent());

      // 3. Get Invoice
      const cbUrl = new URL(callback);
      cbUrl.searchParams.append('amount', amountInMSats.toString());
      cbUrl.searchParams.append('nostr', zapRequestJson);
      cbUrl.searchParams.append('lnurl', lud16);

      const invoiceRes = await fetch(cbUrl.toString());
      const invoiceData = await invoiceRes.json();

      if (invoiceData.pr) {
        setZapInvoice(invoiceData.pr);
        console.log('Zap invoice generated:', invoiceData.pr);

        // Try to pay automatically if window.nostr supports it
        if ((window.nostr as any)?.zap) {
          try {
            await (window.nostr as any).zap(invoiceData.pr);
            setZaps((prev) => prev + 1);
            setZapInvoice(null);
            alert('Zap successful!');
          } catch (e) {
            console.log('Auto-zap failed, showing QR', e);
          }
        }
      } else {
        throw new Error(invoiceData.reason || 'Failed to get invoice');
      }
    } catch (error: any) {
      console.error('Zap flow failed:', error);
      alert(`Zap failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsZapping(false);
    }
  };

  return (
    <div
      className="interaction-bar"
      style={{
        marginTop: '10px',
        fontSize: '8.5pt',
        display: 'flex',
        gap: '10px',
        color: '#666',
      }}
    >
      <a
        href="#"
        onClick={handleLike}
        style={{ color: isLiked ? '#f04e30' : '#003399', fontWeight: isLiked ? 'bold' : 'normal' }}
      >
        {isLiked ? '♥ Liked' : 'like'} ({likes})
      </a>
      |
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onCommentClick?.();
        }}
        style={{ color: '#003399' }}
      >
        comment ({comments})
      </a>
      |
      <a href="#" onClick={handleZap} style={{ color: '#003399' }}>
        {isZapping ? 'zapping...' : `zap (${zaps})`}
      </a>
      {zapInvoice && (
        <div
          className="zap-modal"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'white',
            padding: '20px',
            border: '1px solid #ccc',
            boxShadow: '10px 10px 0px rgba(0,0,0,0.2)',
            zIndex: 1000,
            textAlign: 'center',
            maxWidth: '90vw',
          }}
        >
          <h3
            style={{ margin: '0 0 10px 0', background: '#ff9933', color: 'black', padding: '5px' }}
          >
            Scan to Zap
          </h3>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${zapInvoice}`}
            alt="Zap QR Code"
            style={{ border: '1px solid #ccc', marginBottom: '10px' }}
          />
          <div
            style={{
              fontSize: '8pt',
              marginBottom: '15px',
              wordBreak: 'break-all',
              maxHeight: '100px',
              overflowY: 'auto',
              border: '1px solid #ccc',
              padding: '5px',
              textAlign: 'left',
            }}
          >
            <code>{zapInvoice}</code>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(zapInvoice);
                alert('Invoice copied!');
              }}
              style={{
                padding: '5px 10px',
                cursor: 'pointer',
                fontWeight: 'bold',
                border: '1px solid #ccc',
              }}
            >
              Copy Invoice
            </button>
            <button
              onClick={() => setZapInvoice(null)}
              style={{
                padding: '5px 10px',
                cursor: 'pointer',
                fontWeight: 'bold',
                border: '1px solid #ccc',
                background: '#ccc',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

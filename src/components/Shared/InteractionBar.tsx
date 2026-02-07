import React, { useEffect, useState, useRef } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { useNostr } from '../../context/NostrContext';
import { subscribeToStats, updateStats, getStats, type EventStats } from '../../hooks/statsCache';

interface InteractionBarProps {
  event: NDKEvent;
  onCommentClick?: () => void;
}

export const InteractionBar: React.FC<InteractionBarProps> = ({ event, onCommentClick }) => {
  const { ndk, user, login } = useNostr();
  const [stats, setStats] = useState<EventStats>(() => getStats(event.id) || {
    likes: 0,
    comments: 0,
    reposts: 0,
    zaps: 0,
    likedByMe: false,
    repostedByMe: false,
  });
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteText, setQuoteText] = useState('');
  const [isQuoting, setIsQuoting] = useState(false);
  const [zapInvoice, setZapInvoice] = useState<string | null>(null);
  const [isZapping, setIsZapping] = useState(false);
  const [showRepostConfirm, setShowRepostConfirm] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  // Subscribe to batched stats
  useEffect(() => {
    if (!ndk) return;

    const unsubscribe = subscribeToStats(event.id, ndk, user?.pubkey, (newStats) => {
      setStats(newStats);
    });

    return unsubscribe;
  }, [ndk, event.id, user?.pubkey]);

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      await login();
      return;
    }
    if (stats.likedByMe) return;

    try {
      const reaction = new NDKEvent(ndk);
      reaction.kind = 7;
      reaction.content = '+';
      reaction.tags = [
        ['e', event.id],
        ['p', event.pubkey],
        ['client', 'MyNostrSpace'],
      ];
      await reaction.publish();
      updateStats(event.id, (prev) => ({
        ...prev,
        likes: prev.likes + 1,
        likedByMe: true,
      }));
    } catch (error) {
      console.error('Failed to like:', error);
    }
  };

  const handleRepost = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      await login();
      return;
    }
    if (stats.repostedByMe) return;

    setShowRepostConfirm(true);
  };

  const confirmRepost = async () => {
    setShowRepostConfirm(false);
    try {
      const repost = new NDKEvent(ndk);
      repost.kind = 6;
      repost.content = JSON.stringify(event.rawEvent());
      repost.tags = [
        ['e', event.id, ''],
        ['p', event.pubkey],
        ['client', 'MyNostrSpace'],
      ];
      await repost.publish();
      updateStats(event.id, (prev) => ({
        ...prev,
        reposts: prev.reposts + 1,
        repostedByMe: true,
      }));
    } catch (error) {
      console.error('Failed to repost:', error);
    }
  };

  const handleQuote = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      await login();
      return;
    }
    if (!quoteText.trim()) return;

    setIsQuoting(true);
    try {
      const nevent = nip19.neventEncode({ id: event.id, author: event.pubkey });
      const quote = new NDKEvent(ndk);
      quote.kind = 1;
      quote.content = `${quoteText}\n\nnostr:${nevent}`;
      quote.tags = [
        ['e', event.id, '', 'mention'],
        ['p', event.pubkey],
        ['q', event.id],
        ['client', 'MyNostrSpace'],
      ];
      await quote.publish();
      setQuoteText('');
      setShowQuoteForm(false);
      alert('Quote posted!');
    } catch (error) {
      console.error('Failed to quote:', error);
      alert('Failed to post quote');
    } finally {
      setIsQuoting(false);
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

      let lnurl = '';
      if (lud16.includes('@')) {
        const [name, domain] = lud16.split('@');
        lnurl = `https://${domain}/.well-known/lnurlp/${name}`;
      } else {
        lnurl = lud16;
      }

      const lnurlRes = await fetch(lnurl);
      const lnurlData = await lnurlRes.json();
      const callback = lnurlData.callback;

      if (!callback) {
        throw new Error('No callback found in LNURL data');
      }

      const zapRequest = new NDKEvent(ndk);
      zapRequest.kind = 9734;
      zapRequest.content = 'Zap from MyNostrSpace';
      zapRequest.tags = [
        ['relays', ...ndk.pool.relays.keys()],
        ['amount', amountInMSats.toString()],
        ['lnurl', lud16],
        ['p', event.author.pubkey],
        ['e', event.id],
        ['client', 'MyNostrSpace'],
      ];

      await zapRequest.sign();
      const zapRequestJson = JSON.stringify(zapRequest.rawEvent());

      const cbUrl = new URL(callback);
      cbUrl.searchParams.append('amount', amountInMSats.toString());
      cbUrl.searchParams.append('nostr', zapRequestJson);
      cbUrl.searchParams.append('lnurl', lud16);

      const invoiceRes = await fetch(cbUrl.toString());
      const invoiceData = await invoiceRes.json();

      if (invoiceData.pr) {
        setZapInvoice(invoiceData.pr);
        console.log('Zap invoice generated:', invoiceData.pr);

        if ((window.nostr as unknown as { zap?: (invoice: string) => Promise<void> | void })?.zap) {
          try {
            await (
              window.nostr as unknown as { zap: (invoice: string) => Promise<void> | void }
            ).zap(invoiceData.pr);
            updateStats(event.id, (prev) => ({ ...prev, zaps: prev.zaps + 1 }));
            setZapInvoice(null);
            alert('Zap successful!');
          } catch (err) {
            console.log('Auto-zap failed, showing QR', err);
          }
        }
      } else {
        throw new Error(invoiceData.reason || 'Failed to get invoice');
      }
    } catch (error: unknown) {
      console.error('Zap flow failed:', error);
      alert(`Zap failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsZapping(false);
    }
  };

  return (
    <div
      ref={elementRef}
      className="interaction-bar"
      style={{
        marginTop: '10px',
        fontSize: '8.5pt',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        color: '#666',
      }}
    >
      <a
        href="#"
        onClick={handleLike}
        style={{ color: stats.likedByMe ? '#f04e30' : '#003399', fontWeight: stats.likedByMe ? 'bold' : 'normal' }}
      >
        {stats.likedByMe ? '♥ Liked' : 'like'} ({stats.likes})
      </a>
      <span className="interaction-separator">|</span>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onCommentClick?.();
        }}
        style={{ color: '#003399' }}
      >
        comment ({stats.comments})
      </a>
      <span className="interaction-separator">|</span>
      <a
        href="#"
        onClick={handleRepost}
        style={{
          color: stats.repostedByMe ? '#2e7d32' : '#003399',
          fontWeight: stats.repostedByMe ? 'bold' : 'normal',
        }}
      >
        {stats.repostedByMe ? '🔄 reposted' : `repost (${stats.reposts})`}
      </a>
      <span className="interaction-separator">|</span>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          setShowQuoteForm(!showQuoteForm);
        }}
        style={{ color: '#003399' }}
      >
        quote
      </a>
      <span className="interaction-separator">|</span>
      <a href="#" onClick={handleZap} style={{ color: '#003399' }}>
        {isZapping ? 'zapping...' : `zap (${stats.zaps})`}
      </a>
      {showQuoteForm && (
        <div
          style={{
            flexBasis: '100%',
            marginTop: '8px',
            padding: '8px',
            background: '#f9f9f9',
            border: '1px solid #ccc',
            minWidth: '300px',
          }}
        >
          <textarea
            className="nostr-input"
            value={quoteText}
            onChange={(e) => setQuoteText(e.target.value)}
            placeholder="Add your thoughts..."
            style={{ width: '100%', minHeight: '80px', fontSize: '9pt', boxSizing: 'border-box' }}
          />
          <div style={{ textAlign: 'right', marginTop: '5px' }}>
            <button
              onClick={handleQuote}
              disabled={isQuoting || !quoteText.trim()}
              style={{ fontSize: '8pt', padding: '2px 8px', cursor: 'pointer' }}
            >
              {isQuoting ? 'Posting...' : 'Post Quote'}
            </button>
          </div>
        </div>
      )}
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
      {showRepostConfirm && (
        <div
          className="repost-confirm-modal"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'white',
            padding: '20px',
            border: '1px solid #ccc',
            boxShadow: '10px 10px 0px rgba(0,0,0,0.2)',
            zIndex: 1001,
            textAlign: 'center',
            maxWidth: '90vw',
            minWidth: '250px',
          }}
        >
          <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Repost this note?</h3>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={confirmRepost}
              style={{
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: 'bold',
                border: '1px solid #003399',
                background: '#003399',
                color: 'white',
                borderRadius: '3px',
              }}
            >
              Yes, Repost
            </button>
            <button
              onClick={() => setShowRepostConfirm(false)}
              style={{
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: 'bold',
                border: '1px solid #ccc',
                background: '#f0f0f0',
                borderRadius: '3px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

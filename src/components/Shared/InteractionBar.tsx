import React, { useEffect, useState, useCallback } from 'react';
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { useNostr } from '../../context/NostrContext';

interface InteractionBarProps {
  event: NDKEvent;
  onCommentClick?: () => void;
}

export const InteractionBar: React.FC<InteractionBarProps> = ({ event, onCommentClick }) => {
  const { ndk, user, login } = useNostr();
  const [likes, setLikes] = useState(0);
  const [comments, setComments] = useState(0);
  const [reposts, setReposts] = useState(0);
  const [zaps, setZaps] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isReposted, setIsReposted] = useState(false);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteText, setQuoteText] = useState('');
  const [isQuoting, setIsQuoting] = useState(false);
  const [zapInvoice, setZapInvoice] = useState<string | null>(null);
  const [isZapping, setIsZapping] = useState(false);

  const [hasFetched, setHasFetched] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!ndk || hasFetched) return;
    setHasFetched(true);

    try {
      const filter: NDKFilter = {
        '#e': [event.id],
        kinds: [7, 1, 6, 9735],
      };

      const relatedEvents = await ndk.fetchEvents(filter);

      let likeCount = 0;
      let commentCount = 0;
      let repostCount = 0;
      let zapTotal = 0;
      let likedByMe = false;
      let repostedByMe = false;

      relatedEvents.forEach((e) => {
        if (e.kind === 7) {
          likeCount++;
          if (user && e.pubkey === user.pubkey) likedByMe = true;
        } else if (e.kind === 6) {
          repostCount++;
          if (user && e.pubkey === user.pubkey) repostedByMe = true;
        } else if (e.kind === 1) {
          commentCount++;
        } else if (e.kind === 9735) {
          zapTotal++;
        }
      });

      setLikes(likeCount);
      setComments(commentCount);
      setReposts(repostCount);
      setZaps(zapTotal);
      setIsLiked(likedByMe);
      setIsReposted(repostedByMe);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setHasFetched(false); // Allow retry on failure
    }
  }, [ndk, event.id, user, hasFetched]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchStats();
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    const element = document.getElementById(`interaction-${event.id}`);
    if (element) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [fetchStats, event.id]);

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      await login();
      return;
    }
    if (isLiked) return; // Already liked

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
      setLikes((prev) => prev + 1);
      setIsLiked(true);
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
    if (isReposted) return;

    if (!confirm('Repost this note?')) return;

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
      setReposts((prev) => prev + 1);
      setIsReposted(true);
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
        ['client', 'MyNostrSpace'],
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
        if ((window.nostr as unknown as { zap?: (invoice: string) => Promise<void> | void })?.zap) {
          try {
            await (
              window.nostr as unknown as { zap: (invoice: string) => Promise<void> | void }
            ).zap(invoiceData.pr);
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
    } catch (error: unknown) {
      console.error('Zap flow failed:', error);
      alert(`Zap failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsZapping(false);
    }
  };

  return (
    <div
      id={`interaction-${event.id}`}
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
        style={{ color: isLiked ? '#f04e30' : '#003399', fontWeight: isLiked ? 'bold' : 'normal' }}
      >
        {isLiked ? '♥ Liked' : 'like'} ({likes})
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
        comment ({comments})
      </a>
      <span className="interaction-separator">|</span>
      <a
        href="#"
        onClick={handleRepost}
        style={{
          color: isReposted ? '#2e7d32' : '#003399',
          fontWeight: isReposted ? 'bold' : 'normal',
        }}
      >
        {isReposted ? '🔄 reposted' : `repost (${reposts})`}
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
        {isZapping ? 'zapping...' : `zap (${zaps})`}
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
    </div>
  );
};

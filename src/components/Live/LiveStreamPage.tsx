import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKKind, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
// ReactPlayer removed in favor of native hls.js implementation
import Hls from 'hls.js';
import { ChatMessage } from './ChatMessage';
import { APP_RELAYS } from '../../utils/relay';
import './LiveStreamPage.css';

const CONNECTION_TIMEOUT = 10000;

export const LiveStreamPage = () => {
  const { pubkey, identifier } = useParams();
  const dTag = identifier;
  const { ndk, isLoading, user, login } = useNostr();
  const [streamerProfile, setStreamerProfile] = useState<
    import('@nostr-dev-kit/ndk').NDKUserProfile | null
  >(null);
  const [streamEvent, setStreamEvent] = useState<NDKEvent | null>(null);
  const streamEventRef = useRef<NDKEvent | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<NDKEvent[]>([]);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('Initializing...');
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isZapping, setIsZapping] = useState(false);
  const [zapInvoice, setZapInvoice] = useState<string | null>(null);

  const subRef = useRef<import('@nostr-dev-kit/ndk').NDKSubscription | null>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const connectionRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = () => {
    setConnectionStatus('Retrying connection...');
    connectionRef.current = false;
    setRetryCount((prev) => prev + 1);
  };

  useEffect(() => {
    if (isLoading || !ndk || !pubkey || !dTag) return;

    let isMounted = true;

    const fetchData = async () => {
      // Prevent double-execution in Strict Mode
      if (connectionRef.current) return;
      connectionRef.current = true;

      const cleanPubkey = pubkey.toLowerCase();
      const cleanDTag = dTag.toLowerCase();

      setConnectionStatus('Connecting...');

      try {
        // Short wait to ensure socket stability
        await new Promise((r) => setTimeout(r, 1000));
      } catch (e) {
        console.warn('Discovery: Stabilization wait error', e);
      }

      const connectedCount = ndk.pool.connectedRelays().length;
      console.log(`Discovery: Connected to ${connectedCount} relays.`);

      if (!isMounted) return;

      // We search for the stream in two ways:
      // 1. The URL pubkey is the signer (standard)
      // 2. The URL pubkey is the host (p-tag), which LandingPage prefers
      const streamFilter: NDKFilter[] = [
        { kinds: [30311 as NDKKind], authors: [cleanPubkey], '#d': [cleanDTag] },
        { kinds: [30311 as NDKKind], '#p': [cleanPubkey], '#d': [cleanDTag] },
      ];

      setConnectionStatus('Searching...');

      // Subscription
      console.log(`Discovery (Sub): Starting subscription for ${cleanPubkey} / ${cleanDTag}...`);

      const sub = ndk.subscribe(streamFilter, {
        closeOnEose: false,
        subId: `sub-stream-${Date.now()}`,
      });

      sub.on('event', (e) => {
        console.log('Discovery: Stream found via sub from:', e.relay?.url || 'unknown');
        if (isMounted) handleStreamEvent(e);
        sub.stop();
      });

      // Timeout
      setTimeout(() => {
        if (isMounted && !streamEventRef.current) {
          setConnectionStatus('Nothing found. Check relays or URL?');
          console.warn('Discovery: Subscription timed out.');
        }
        sub.stop();
      }, CONNECTION_TIMEOUT);
    };

    const handleStreamEvent = async (event: NDKEvent) => {
      if (!isMounted) return;
      setStreamEvent(event);
      streamEventRef.current = event;
      setConnectionStatus('Loading broadcast data...');
      const url = event.getMatchingTags('streaming')[0]?.[1];
      setStreamUrl(url || null);

      // Determine the real host (p tag) or default to author
      const hostPubkey = event.getMatchingTags('p')[0]?.[1] || event.pubkey;

      // Fetch streamer profile manually
      const streamer = ndk.getUser({ pubkey: hostPubkey });
      try {
        const profile = await streamer.fetchProfile();
        if (isMounted) setStreamerProfile(profile);
      } catch (e) {
        console.warn('Failed to fetch profile', e);
      }

      // Subscribe to chat
      // Use stream event author's pubkey for the a tag filter (this is how chat messages are tagged)
      const streamAuthor = event.pubkey;
      const streamDTag = event.getMatchingTags('d')[0]?.[1] || dTag;
      const aTag = `30311:${streamAuthor}:${streamDTag}`;
      const chatFilter: NDKFilter = {
        kinds: [1311 as NDKKind, 9735 as NDKKind],
        '#a': [aTag],
        limit: 100,
      };

      // Ensure streaming relays are connected for cross-platform chat
      const relayPromises: Promise<void>[] = [];
      for (const relayUrl of APP_RELAYS.STREAMING) {
        try {
          if (!ndk.pool.relays.has(relayUrl)) {
            const relay = ndk.addExplicitRelay(relayUrl);
            if (relay && typeof relay.connect === 'function') {
              relayPromises.push(relay.connect().catch(() => { }));
            }
          }
        } catch {
          // Silently ignore relay add failures
        }
      }

      // Wait a bit for relays to connect before subscribing
      await Promise.race([
        Promise.all(relayPromises),
        new Promise(r => setTimeout(r, 2000))
      ]);

      const sub = ndk.subscribe(chatFilter, { closeOnEose: false });
      sub.on('event', (msg: NDKEvent) => {
        if (!isMounted) return;
        setChatMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev;
          const newMsgs = [...prev, msg].sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
          return newMsgs;
        });
      });
      subRef.current = sub;
    };

    fetchData();

    return () => {
      isMounted = false;
      if (subRef.current) subRef.current.stop();
    };
  }, [ndk, pubkey, dTag, isLoading, retryCount]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendMessage = async () => {
    if (!ndk || !chatInput.trim() || !streamEvent) return;

    if (!user) {
      login();
      return;
    }

    setSending(true);
    try {
      // Use stream event author's pubkey and d-tag (matches how other platforms tag chat)
      const streamAuthor = streamEvent.pubkey;
      const streamDTag = streamEvent.getMatchingTags('d')[0]?.[1] || '';

      const event = new NDKEvent(ndk);
      event.kind = 1311;
      event.content = chatInput;
      event.tags = [
        ['a', `30311:${streamAuthor}:${streamDTag}`, 'wss://relay.zap.stream'],
        ['client', 'MyNostrSpace'],
      ];

      // Ensure streaming relays are connected before publishing
      for (const relayUrl of APP_RELAYS.STREAMING) {
        try {
          if (!ndk.pool.relays.has(relayUrl)) {
            ndk.addExplicitRelay(relayUrl);
          }
        } catch {
          // Silently ignore relay add failures
        }
      }

      // Sign and publish to all connected relays including streaming relays
      await event.publish();

      setChatInput('');
    } catch (e) {
      console.error('Failed to send message', e);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleZap = async () => {
    if (!ndk || !streamEvent) return;
    if (!user) {
      login();
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

      const hostPubkey = streamEvent.getMatchingTags('p')[0]?.[1] || streamEvent.pubkey;
      const streamer = ndk.getUser({ pubkey: hostPubkey });

      // Use existing streamerProfile if we have it, otherwise fetch
      const profile = streamerProfile || (await streamer.fetchProfile());
      const lud16 = profile?.lud16 || profile?.lud06;

      if (!lud16) {
        alert("This user hasn't set up a Lightning address (lud16).");
        return;
      }

      // Manual LNURL-Zap Flow
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

      // Create Zap Request (Kind 9734)
      const zapRequest = new NDKEvent(ndk);
      zapRequest.kind = 9734;
      zapRequest.content = 'Zap from MyNostrSpace';

      const streamDTag = streamEvent.getMatchingTags('d')[0]?.[1] || dTag;
      const zapRelays = [...ndk.pool.relays.keys()];
      if (!zapRelays.includes('wss://relay.zap.stream')) {
        zapRelays.push('wss://relay.zap.stream');
      }

      zapRequest.tags = [
        ['relays', ...zapRelays],
        ['amount', amountInMSats.toString()],
        ['lnurl', lud16],
        ['p', hostPubkey],
        ['e', streamEvent.id],
        ['a', `30311:${streamEvent.pubkey}:${streamDTag}`, 'wss://relay.zap.stream'],
        ['client', 'MyNostrSpace'],
      ];

      await zapRequest.sign();

      // Explicitly publish the zap request so other platforms see it immediately
      zapRequest.publish().catch(e => console.warn('Failed to publish zap request', e));

      const zapRequestJson = JSON.stringify(zapRequest.rawEvent());

      const cbUrl = new URL(callback);
      cbUrl.searchParams.append('amount', amountInMSats.toString());
      cbUrl.searchParams.append('nostr', zapRequestJson);
      cbUrl.searchParams.append('lnurl', lud16);

      const invoiceRes = await fetch(cbUrl.toString());
      const invoiceData = await invoiceRes.json();

      if (invoiceData.pr) {
        setZapInvoice(invoiceData.pr);
        const nostrWindow = window as unknown as {
          nostr?: { zap: (pr: string) => Promise<void> };
        };
        if (nostrWindow.nostr?.zap) {
          try {
            await nostrWindow.nostr.zap(invoiceData.pr);
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

  // Initialize HLS
  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;

    let isMounted = true;
    const video = videoRef.current;

    const attemptPlay = async () => {
      if (!isMounted) return;
      try {
        await video.play();
      } catch (e) {
        console.warn('Autoplay failed, user will need to click play', e);
      }
    };

    // Check for native HLS support first (Safari)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      console.log('Using native HLS (Safari)');
      video.src = streamUrl;

      const handleCanPlay = () => {
        if (isMounted) attemptPlay();
        video.removeEventListener('canplay', handleCanPlay);
      };

      video.addEventListener('canplay', handleCanPlay);
      if (video.readyState >= 3) {
        attemptPlay();
      }
    }
    // Check for HLS.js support
    else if (Hls.isSupported()) {
      console.log('Using HLS.js');
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        debug: false,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (isMounted) attemptPlay();
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('HLS Network Error', data);
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('HLS Media Error', data);
              hls.recoverMediaError();
              break;
            default:
              console.error('HLS Fatal Error', data);
              hls.destroy();
              break;
          }
        }
      });

      hlsRef.current = hls;
    }

    return () => {
      isMounted = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl]);

  if (!streamEvent) {
    return (
      <div className="loading-screen" style={{ flexDirection: 'column', gap: '10px' }}>
        <div style={{ color: '#FF6600', fontWeight: 'bold' }}>Loading Broadcast...</div>
        <div style={{ fontSize: '0.8rem', color: '#666' }}>{connectionStatus}</div>
        {connectionStatus.includes('Nothing found') && (
          <div
            style={{
              fontSize: '0.7rem',
              color: '#888',
              marginTop: '10px',
              maxWidth: '300px',
              textAlign: 'center',
            }}
          >
            Note: If this is your own pubkey, you must publish a kind 30311 event first.
            <br />
            <button
              onClick={handleRetry}
              style={{
                marginTop: '10px',
                padding: '5px 10px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                background: 'white',
                cursor: 'pointer',
              }}
            >
              Retry Connection
            </button>
          </div>
        )}
      </div>
    );
  }

  const title = streamEvent.getMatchingTags('title')[0]?.[1] || 'Untitled Stream';
  const summary = streamEvent.getMatchingTags('summary')[0]?.[1] || '';
  const status = streamEvent.getMatchingTags('status')[0]?.[1];

  return (
    <div className="home-page-container livestream-page-container">
      {/* Header */}
      <div className="home-wrapper livestream-wrapper">
        <Navbar />

        {/* Main Content Table Layout */}
        <div className="myspace-body">
          <div className="col-left">
            <div className="profile-box">
              <h3>{streamerProfile?.name || streamerProfile?.display_name || 'Broadcaster'}</h3>
              <div className="profile-pic">
                <Link to={`/p/${pubkey}`}>
                  <img
                    src={streamerProfile?.picture || `https://robohash.org/${pubkey}`}
                    alt="Streamer"
                  />
                </Link>
              </div>
              <div className="profile-details">
                <p>{streamerProfile?.about}</p>
                <div className="online-status">
                  {status === 'live' ? (
                    <span className="status-badge live">ONLINE NOW!</span>
                  ) : (
                    <span className="status-badge offline">OFFLINE</span>
                  )}
                </div>
                <div className="contact-links">
                  <Link to={`/p/${pubkey}`}>View Profile</Link>
                </div>
              </div>
            </div>
          </div>

          <div className="col-right">
            <div className="content-box video-box">
              <div className="box-header">
                <h2>{title}</h2>
              </div>
              <div className="video-player-wrapper">
                {streamUrl ? (
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: 'auto',
                      maxHeight: '80vh',
                      display: 'flex',
                      justifyContent: 'center',
                      backgroundColor: 'black',
                      overflow: 'hidden',
                    }}
                  >
                    {!isVideoReady && (
                      <div className="skeleton-loader">
                        <div className="skeleton-spinner"></div>
                      </div>
                    )}
                    <video
                      ref={videoRef}
                      controls
                      playsInline
                      className="react-player"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '80vh',
                        width: 'auto',
                        height: 'auto',
                        display: 'block',
                      }}
                      onLoadedMetadata={() => setIsVideoReady(true)}
                    />
                  </div>
                ) : (
                  <div className="no-stream">Stream URL not found</div>
                )}
              </div>

              <div className="stream-summary">
                <p>{summary}</p>
              </div>
            </div>

            <div className="content-box chat-box">
              <div className="box-header">
                <h2>Live Chat</h2>
              </div>
              <div className="chat-window" ref={chatWindowRef}>
                {chatMessages.length === 0 ? (
                  <div className="empty-chat">No messages yet. Say hello!</div>
                ) : (
                  chatMessages.map((msg) => <ChatMessage key={msg.id} msg={msg} />)
                )}
                <div ref={chatBottomRef} />
              </div>
              <div className="chat-input-area">
                {user ? (
                  <>
                    <input
                      className="nostr-input"
                      type="text"
                      placeholder="Say something..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      disabled={sending}
                    />
                    <button
                      className="post-button zap-button"
                      onClick={handleZap}
                      disabled={isZapping}
                    >
                      {isZapping ? '...' : '⚡ Zap'}
                    </button>
                    <button
                      className="post-button"
                      onClick={handleSendMessage}
                      disabled={sending || !chatInput.trim()}
                    >
                      {sending ? '...' : 'Post'}
                    </button>
                  </>
                ) : (
                  <button className="post-button" onClick={() => login()} style={{ width: '100%' }}>
                    Login to Chat
                  </button>
                )}
              </div>
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
                    color: 'black',
                  }}
                >
                  <h3
                    style={{
                      margin: '0 0 10px 0',
                      background: '#ffcc99',
                      color: '#ff6600',
                      padding: '5px',
                    }}
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
                      className="post-button"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => setZapInvoice(null)}
                      className="post-button"
                      style={{ background: '#ccc' }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="myspace-footer">
          <a href="#">About</a> | <a href="#">FAQ</a> | <a href="#">Terms</a> |{' '}
          <a href="#">Privacy</a>
          <br />© 2003-2026 mynostrspace.com
        </footer>
      </div>
    </div>
  );
};

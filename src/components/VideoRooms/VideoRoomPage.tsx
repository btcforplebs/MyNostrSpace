import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKKind, NDKRelaySet, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import './VideoRoomPage.css';

const CONNECTION_TIMEOUT = 10000;

export const VideoRoomPage = () => {
  const { pubkey, identifier } = useParams();
  const navigate = useNavigate();
  const dTag = identifier;
  const { ndk, isLoading, user, login } = useNostr();
  const [hostProfile, setHostProfile] = useState<
    import('@nostr-dev-kit/ndk').NDKUserProfile | null
  >(null);
  const [roomEvent, setRoomEvent] = useState<NDKEvent | null>(null);
  const roomEventRef = useRef<NDKEvent | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('Connecting...');
  const [chatMessages, setChatMessages] = useState<NDKEvent[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);

  const subRef = useRef<import('@nostr-dev-kit/ndk').NDKSubscription | null>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLoading || !ndk || !pubkey || !dTag) return;

    let isMounted = true;

    const fetchData = async () => {
      const cleanPubkey = pubkey.toLowerCase();
      const cleanDTag = dTag.toLowerCase();

      setConnectionStatus('Searching for video room...');

      const filter: NDKFilter = {
        kinds: [30311 as NDKKind],
        authors: [cleanPubkey],
        '#d': [cleanDTag],
      };

      const sub = ndk.subscribe(filter, { closeOnEose: false });

      sub.on('event', (e: NDKEvent) => {
        if (isMounted) handleRoomEvent(e);
        sub.stop();
      });

      setTimeout(() => {
        if (isMounted && !roomEventRef.current) {
          setConnectionStatus('Video room not found.');
        }
        sub.stop();
      }, CONNECTION_TIMEOUT);
    };

    const handleRoomEvent = async (event: NDKEvent) => {
      if (!isMounted) return;
      setRoomEvent(event);
      roomEventRef.current = event;
      setConnectionStatus('Loading room...');
      const url = event.getMatchingTags('streaming')[0]?.[1];
      setStreamUrl(url || null);

      const hostPubkey = event.getMatchingTags('p')[0]?.[1] || event.pubkey;
      ndk
        .getUser({ pubkey: hostPubkey })
        .fetchProfile()
        .then((p) => {
          if (isMounted) setHostProfile(p);
        });

      // Subscribe to chat
      const aTag = `30311:${event.pubkey}:${event.getMatchingTags('d')[0]?.[1] || dTag}`;
      const chatFilter: NDKFilter = {
        kinds: [1311 as NDKKind],
        '#a': [aTag],
        limit: 100,
      };

      const chatSub = ndk.subscribe(chatFilter, { closeOnEose: false });
      chatSub.on('event', (e: NDKEvent) => {
        if (!isMounted) return;
        setChatMessages((prev) => {
          if (prev.find((m) => m.id === e.id)) return prev;
          return [...prev, e].sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
        });
      });
      subRef.current = chatSub;
    };

    fetchData();

    return () => {
      isMounted = false;
      if (subRef.current) subRef.current.stop();
    };
  }, [ndk, pubkey, dTag, isLoading]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendMessage = async () => {
    if (!ndk || !chatInput.trim() || !roomEvent || !user) return;

    setSending(true);
    try {
      const streamAuthor = roomEvent.pubkey;
      const streamDTag = roomEvent.getMatchingTags('d')[0]?.[1] || '';

      const event = new NDKEvent(ndk);
      event.kind = 1311;
      event.content = chatInput;
      event.tags = [
        ['a', `30311:${streamAuthor}:${streamDTag}`],
        ['client', 'MyNostrSpace'],
      ];

      await event.publish();
      setChatInput('');
    } catch (e) {
      console.error('Failed to send message', e);
    } finally {
      setSending(false);
    }
  };

  const handleKillRoom = async () => {
    if (!ndk || !roomEvent || !user) {
      console.error('handleKillRoom: missing requirements', {
        ndk: !!ndk,
        roomEvent: !!roomEvent,
        user: !!user,
      });
      alert('Cannot delete room: missing required authentication');
      return;
    }

    if (
      !window.confirm(
        'Are you sure you want to KILL this room? This will delete the room event for everyone.'
      )
    ) {
      return;
    }

    try {
      console.log('Attempting to delete room event:', roomEvent.id);
      const actualDTag = roomEvent.getMatchingTags('d')[0]?.[1] || identifier || '';

      const event = new NDKEvent(ndk);
      event.kind = 5;
      event.tags = [
        ['e', roomEvent.id],
        ['a', `${roomEvent.kind}:${roomEvent.pubkey}:${actualDTag}`],
        ['k', roomEvent.kind?.toString() || '30311'],
      ];
      event.content = 'Deleting video room';

      console.log('Publishing deletion event to all relays...', event);

      // Publish to multiple major relays explicitly
      const relayUrls = [
        'wss://relay.damus.io',
        'wss://relay.primal.net',
        'wss://relay.nostr.band',
        'wss://nos.lol',
        'wss://relay.snort.social',
      ];

      let successCount = 0;
      for (const url of relayUrls) {
        try {
          await event.publish(NDKRelaySet.fromRelayUrls([url], ndk));
          console.log(`✓ Published to ${url}`);
          successCount++;
        } catch (e) {
          console.warn(`✗ Failed to publish to ${url}:`, e);
        }
      }

      console.log(`Deletion published to ${successCount}/${relayUrls.length} relays.`);
      alert(
        `Room deletion broadcasted to ${successCount} relays! The room should disappear within a few seconds.`
      );
      navigate('/videorooms');
    } catch (e) {
      console.error('Failed to kill room:', e);
      alert(`Failed to kill room: ${e}`);
    }
  };

  if (!roomEvent) {
    return (
      <div className="video-room-loading-screen">
        <Navbar />
        <div className="loading-content">
          <p>{connectionStatus}</p>
        </div>
      </div>
    );
  }

  const title = roomEvent.getMatchingTags('title')[0]?.[1] || 'Untitled Video Room';
  const summary = roomEvent.getMatchingTags('summary')[0]?.[1] || '';
  const isHost = user?.pubkey === roomEvent.pubkey;
  console.log('VideoRoomPage Debug:', {
    userPubkey: user?.pubkey,
    roomOwner: roomEvent.pubkey,
    isHost,
  });

  return (
    <div className="video-room-page-container">
      <div className="video-room-wrapper">
        <Navbar />
        <div className="myspace-body">
          <div className="col-left">
            <div className="profile-box">
              <h3>{hostProfile?.name || 'Host'}</h3>
              <div className="profile-pic">
                <img src={hostProfile?.picture || `https://robohash.org/${pubkey}`} alt="Host" />
              </div>
              <div className="contact-links">
                <Link to={`/p/${pubkey}`}>View Profile</Link>
              </div>
            </div>
          </div>

          <div className="col-right">
            <div className="content-box video-player-box">
              <div className="box-header">
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <h2>{title}</h2>
                  {isHost && (
                    <button
                      onClick={handleKillRoom}
                      className="kill-room-btn"
                      title="Delete this room"
                      style={{
                        background: 'red',
                        color: 'white',
                        border: '1px solid darkred',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8em',
                        fontWeight: 'bold',
                      }}
                    >
                      ☠️ DELETE EVENT (Hard Kill)
                    </button>
                  )}
                </div>
              </div>
              <div className="video-room-main">
                {streamUrl ? (
                  <>
                    {streamUrl.includes('vdo.ninja') ? (
                      <div style={{ width: '100%', height: '600px' }}>
                        <iframe
                          src={streamUrl}
                          style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            borderRadius: '8px',
                          }}
                          allow="camera; microphone; display-capture; autoplay; clipboard-write; compute-pressure"
                          allowFullScreen
                          title="VDO.ninja Video Room"
                        />
                        <a
                          href={streamUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'block',
                            marginTop: '10px',
                            textAlign: 'center',
                            color: 'var(--myspace-link, #003399)',
                            fontSize: '0.9em',
                          }}
                        >
                          Open in new tab ↗
                        </a>
                      </div>
                    ) : (
                      <div style={{ width: '100%', height: '600px' }}>
                        <iframe
                          src={streamUrl}
                          style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            borderRadius: '8px',
                          }}
                          allow="camera; microphone; display-capture; autoplay; clipboard-write"
                          allowFullScreen
                          title="Video Room"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="no-stream">
                    <p>Video room URL not available.</p>
                  </div>
                )}
                {summary && (
                  <div className="room-summary">
                    <p>{summary}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="content-box chat-box">
              <div className="box-header">
                <h2>Room Chat</h2>
              </div>
              <div className="chat-window" ref={chatWindowRef}>
                {chatMessages.length === 0 ? (
                  <div className="empty-chat">No messages yet.</div>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className="chat-message">
                      <span className="chat-author">{msg.pubkey.slice(0, 8)}...</span>
                      <span className="chat-content">{msg.content}</span>
                    </div>
                  ))
                )}
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
                      className="post-button"
                      onClick={handleSendMessage}
                      disabled={sending || !chatInput.trim()}
                    >
                      {sending ? '...' : 'Post'}
                    </button>
                  </>
                ) : (
                  <button className="post-button" onClick={() => login()}>
                    Login to Chat
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="myspace-footer">© 2003-2026 mynostrspace.com</footer>
      </div>
    </div>
  );
};

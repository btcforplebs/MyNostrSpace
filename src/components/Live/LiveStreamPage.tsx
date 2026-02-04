import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKKind, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
// ReactPlayer removed in favor of native hls.js implementation
// @ts-ignore: hls.js types are sometimes tricky with bundlers
import Hls from 'hls.js';
import { ChatMessage } from './ChatMessage';
import './LiveStreamPage.css';

export const LiveStreamPage = () => {
    const { pubkey, identifier } = useParams();
    const dTag = identifier;
    const { ndk, isLoading, user, login } = useNostr();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [streamerProfile, setStreamerProfile] = useState<any>(null);
    const [streamEvent, setStreamEvent] = useState<NDKEvent | null>(null);
    const [streamUrl, setStreamUrl] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<NDKEvent[]>([]);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<string>("Initializing...");
    const [chatInput, setChatInput] = useState('');
    const [sending, setSending] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subRef = useRef<any>(null);
    const chatBottomRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const connectionRef = useRef(false);
    const [retryCount, setRetryCount] = useState(0);

    const handleRetry = () => {
        setConnectionStatus("Retrying connection...");
        connectionRef.current = false;
        setRetryCount(prev => prev + 1);
    };

    // Unified settings for all browsers
    const STREAM_RELAYS = [
        'wss://relay.zap.stream',
        'wss://relay.highlighter.com',
        'wss://relay.damus.io',
        'wss://nos.lol'
    ];
    const CONNECTION_TIMEOUT = 10000;

    useEffect(() => {
        if (isLoading || !ndk || !pubkey || !dTag) return;

        let isMounted = true;

        const fetchData = async () => {
            // Prevent double-execution in Strict Mode
            if (connectionRef.current) return;
            connectionRef.current = true;

            const cleanPubkey = pubkey.toLowerCase();
            const cleanDTag = dTag.toLowerCase();

            setConnectionStatus("Connecting...");

            console.log("Discovery: Ensuring specific relays are connected...", STREAM_RELAYS);

            // Connect to specific relays individually to avoid global connection storms
            const connectPromises = STREAM_RELAYS.map(async (url) => {
                try {
                    // Check if relay already exists in pool
                    let relay = ndk.pool.relays.get(url);

                    if (!relay) {
                        relay = ndk.addExplicitRelay(url, undefined);
                    }

                    if (relay.status !== 1) { // 1 = CONNECTED
                        await relay.connect();
                    }
                    return relay;
                } catch (e) {
                    console.warn(`Discovery: Failed to connect to ${url}`, e);
                    return null;
                }
            });

            // Wait for all attempts to finish
            await Promise.allSettled(connectPromises);

            try {
                // Short wait to ensure socket stability
                await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                console.warn("Discovery: Stabilization wait error", e);
            }

            const connectedCount = ndk.pool.connectedRelays().length;
            console.log(`Discovery: Connected to ${connectedCount} relays.`);

            if (!isMounted) return;

            // We search for the stream in two ways:
            // 1. The URL pubkey is the signer (standard)
            // 2. The URL pubkey is the host (p-tag), which LandingPage prefers
            const streamFilter: NDKFilter[] = [
                { kinds: [30311 as NDKKind], authors: [cleanPubkey], '#d': [cleanDTag] },
                { kinds: [30311 as NDKKind], '#p': [cleanPubkey], '#d': [cleanDTag] }
            ];

            setConnectionStatus("Searching...");

            // Subscription
            console.log(`Discovery (Sub): Starting subscription for ${cleanPubkey} / ${cleanDTag}...`);

            const sub = ndk.subscribe(streamFilter, { closeOnEose: false, subId: `sub-stream-${Date.now()}` });

            sub.on('event', (e) => {
                console.log("Discovery: Stream found via sub from:", e.relay?.url || 'unknown');
                if (isMounted) handleStreamEvent(e);
                sub.stop();
            });

            // Timeout
            setTimeout(() => {
                if (isMounted && !streamEvent) {
                    setConnectionStatus("Nothing found. Check relays or URL?");
                    console.warn("Discovery: Subscription timed out.");
                }
                sub.stop();
            }, CONNECTION_TIMEOUT);
        };

        const handleStreamEvent = async (event: NDKEvent) => {
            if (!isMounted) return;
            setStreamEvent(event);
            setConnectionStatus("Loading broadcast data...");
            const url = event.getMatchingTags('streaming')[0]?.[1];
            setStreamUrl(url || null);

            // Determine the real host (p tag) or default to author
            const hostPubkey = event.getMatchingTags('p')[0]?.[1] || event.pubkey;

            // Fetch streamer profile manually
            const user = ndk.getUser({ pubkey: hostPubkey });
            try {
                const profile = await user.fetchProfile();
                if (isMounted) setStreamerProfile(profile);
            } catch (e) {
                console.warn("Failed to fetch profile", e);
            }

            // Subscribe to chat
            const aTag = `30311:${pubkey}:${dTag}`;
            const chatFilter: NDKFilter = {
                kinds: [1311 as NDKKind],
                '#a': [aTag],
                limit: 50
            };

            const sub = ndk.subscribe(chatFilter, { closeOnEose: false });
            sub.on('event', (msg: NDKEvent) => {
                if (!isMounted) return;
                setChatMessages(prev => {
                    if (prev.find(m => m.id === msg.id)) return prev;
                    const newMsgs = [...prev, msg].sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
                    return newMsgs;
                });
            });
            subRef.current = sub;
        };

        fetchData();

        return () => {
            isMounted = false;
            // We don't reset connectionRef.current here because we want to prevent re-runs on quick unmount/remount in strict mode
            // unless the actual dependencies changes (which will recreate the effect entirely?)
            // Actually, in Strict Mode, the effect runs twice on the SAME component instance.
            // But if the user navigates away and back, we DO want it to run again.
            // React handles this: new component instance = new ref. Strict mode double-effect = same ref.

            if (subRef.current) subRef.current.stop();
        };

    }, [ndk, pubkey, dTag, isLoading, retryCount]);

    const handleSendMessage = async () => {
        if (!ndk || !chatInput.trim() || !pubkey || !dTag) return;

        if (!user) {
            login();
            return;
        }

        setSending(true);
        try {
            const event = new NDKEvent(ndk);
            event.kind = 1311;
            event.content = chatInput;
            event.tags = [
                ['a', `30311:${pubkey}:${dTag}`, '']
            ];
            await event.publish();

            // Optimistic update handled by subscription mostly, but we can clear input immediately
            setChatInput('');

            // Optional: Add to local state immediately for instant feedback if sub is slow
            // setChatMessages(prev => [...prev, event]);
        } catch (e) {
            console.error("Failed to send message", e);
            alert("Failed to send message");
        } finally {
            setSending(false);
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
                video.muted = false;
                await video.play();
            } catch (error) {
                console.warn("Autoplay blocked, falling back to muted", error);
                video.muted = true;
                try {
                    await video.play();
                } catch (e) {
                    console.error("Muted autoplay also failed", e);
                }
            }
        };

        // Check for native HLS support first (Safari)
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            console.log("Using native HLS (Safari)");
            video.src = streamUrl;

            // Safari often needs a listener or a slight delay after setting src
            const handleCanPlay = () => {
                if (isMounted) attemptPlay();
                video.removeEventListener('canplay', handleCanPlay);
            };

            video.addEventListener('canplay', handleCanPlay);
            // Also try immediately in case it's already cached/ready
            if (video.readyState >= 3) {
                attemptPlay();
            }
        }
        // Check for HLS.js support
        else if (Hls.isSupported()) {
            console.log("Using HLS.js");
            if (hlsRef.current) {
                hlsRef.current.destroy();
            }

            const hls = new Hls({
                debug: false, // Reduced noise
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
                            console.error("HLS Network Error", data);
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error("HLS Media Error", data);
                            hls.recoverMediaError();
                            break;
                        default:
                            console.error("HLS Fatal Error", data);
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
                {connectionStatus.includes("Nothing found") && (
                    <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '10px', maxWidth: '300px', textAlign: 'center' }}>
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
                                cursor: 'pointer'
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
        <div className="myspace-container">
            {/* Header */}
            <Navbar />

            {/* Main Content Table Layout */}
            <div className="myspace-body">
                <div className="col-left">
                    <div className="profile-box">
                        <h3>{streamerProfile?.name || streamerProfile?.display_name || 'Broadcaster'}</h3>
                        <div className="profile-pic">
                            <img src={streamerProfile?.picture || `https://robohash.org/${pubkey}`} alt="Streamer" />
                        </div>
                        <div className="profile-details">
                            <p>{streamerProfile?.about?.slice(0, 100)}</p>
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
                                <div style={{
                                    position: 'relative',
                                    width: '100%',
                                    height: 'auto',
                                    maxHeight: '80vh',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    backgroundColor: 'black',
                                    overflow: 'hidden'
                                }}>
                                    {!isVideoReady && (
                                        <div className="skeleton-loader">
                                            <div className="skeleton-spinner"></div>
                                        </div>
                                    )}
                                    <video
                                        ref={videoRef}
                                        controls
                                        autoPlay
                                        muted
                                        playsInline
                                        className="react-player"
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: '80vh',
                                            width: 'auto',
                                            height: 'auto',
                                            display: 'block'
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
                        <div className="chat-window">
                            {chatMessages.length === 0 ? (
                                <div className="empty-chat">No messages yet. Say hello!</div>
                            ) : (
                                chatMessages.map(msg => (
                                    <ChatMessage key={msg.id} msg={msg} />
                                ))
                            )}
                            <div ref={chatBottomRef} />
                        </div>
                        <div className="chat-input-area">
                            {user ? (
                                <>
                                    <input
                                        type="text"
                                        placeholder="Say something..."
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                        disabled={sending}
                                    />
                                    <button onClick={handleSendMessage} disabled={sending || !chatInput.trim()}>
                                        {sending ? '...' : 'Post'}
                                    </button>
                                </>
                            ) : (
                                <button onClick={() => login()} style={{ width: '100%' }}>
                                    Login to Chat
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <footer className="myspace-footer">
                <a href="#">About</a> | <a href="#">FAQ</a> | <a href="#">Terms</a> | <a href="#">Privacy</a>
                <br />
                © 2003-2026 mynostrspace.com
            </footer>
        </div >
    );
};

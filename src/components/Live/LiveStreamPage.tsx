import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKKind, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
// ReactPlayer removed in favor of native hls.js implementation
import Hls from 'hls.js';
import { ChatMessage } from './ChatMessage';
import './LiveStreamPage.css';

export const LiveStreamPage = () => {
    const { pubkey, identifier } = useParams();
    const dTag = identifier;
    const { ndk } = useNostr();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [streamerProfile, setStreamerProfile] = useState<any>(null);
    const [streamEvent, setStreamEvent] = useState<NDKEvent | null>(null);
    const [streamUrl, setStreamUrl] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<NDKEvent[]>([]);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<string>("Initializing...");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subRef = useRef<any>(null);
    const chatBottomRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);

    // Browser-specific settings detection
    const getBrowserSettings = () => {
        const ua = navigator.userAgent.toLowerCase();
        const isSafari = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android');

        if (isSafari) {
            console.log("Browser Detection: Configuring for Safari");
            return {
                relays: [
                    'wss://relay.damus.io',
                    'wss://relay.primal.net',
                    'wss://nos.lol',
                    'wss://relay.snort.social'
                ],
                connectDelay: 1200, // Longer delay for Safari WebSocket stability
                useFetchFirst: false, // Subscriptions are often more reliable in Safari's selective networking
                timeout: 20000
            };
        }

        return {
            relays: [
                'wss://relay.damus.io',
                'wss://relay.primal.net',
                'wss://nos.lol',
                'wss://relay.snort.social',
                'wss://purplepag.es',
                'wss://relay.nostr.band',
                'wss://atlas.nostr.land',
                'wss://relay.nostr.ch'
            ],
            connectDelay: 500,
            useFetchFirst: true,
            timeout: 15000
        };
    };

    useEffect(() => {
        if (!ndk || !pubkey || !dTag) return;

        let isMounted = true;

        const fetchData = async () => {
            const settings = getBrowserSettings();
            const cleanPubkey = pubkey.toLowerCase();
            const cleanDTag = dTag.toLowerCase();

            setConnectionStatus("Connecting...");

            console.log("Discovery: Adding explicit relays...", settings.relays);
            settings.relays.forEach(r => ndk.addExplicitRelay(r, undefined));

            try {
                // Ensure connection handshake is complete
                await ndk.connect(2500);
                // Stabilization delay
                await new Promise(r => setTimeout(r, settings.connectDelay));
            } catch (e) {
                console.warn("Discovery: NDK connect timeout", e);
            }

            const connectedCount = ndk.pool.connectedRelays().length;
            console.log(`Discovery: Connected to ${connectedCount} relays.`);

            if (!isMounted) return;

            const streamFilter: NDKFilter = {
                kinds: [30311 as NDKKind],
                authors: [cleanPubkey],
                '#d': [cleanDTag],
            };

            setConnectionStatus("Searching...");

            // 1. Try Fetch First (if configured)
            if (settings.useFetchFirst) {
                console.log(`Discovery (Fetch): Searching for ${cleanPubkey} / ${cleanDTag}...`);
                try {
                    const subId = `fetch-stream-${Date.now()}`;
                    const event = await ndk.fetchEvent(streamFilter, { subId });
                    if (event && isMounted) {
                        console.log("Discovery: Stream found via fetch!");
                        handleStreamEvent(event);
                        return;
                    }
                } catch (err) {
                    console.warn("Discovery: Fetch error", err);
                }
            }

            if (!isMounted || streamEvent) return;

            // 2. Subscription/Fallback
            setConnectionStatus("Searching (sub)...");
            console.log(`Discovery (Sub): Starting subscription for ${cleanPubkey} / ${cleanDTag}...`);

            const sub = ndk.subscribe(streamFilter, { closeOnEose: false, subId: `sub-stream-${Date.now()}` });

            sub.on('event', (e) => {
                console.log("Discovery: Stream found via sub from:", e.relay?.url || 'unknown');
                if (isMounted) handleStreamEvent(e);
                sub.stop();
            });

            // Browser-specific timeout
            setTimeout(() => {
                if (isMounted && !streamEvent) {
                    setConnectionStatus("Nothing found. Check relays or URL?");
                    console.warn("Discovery: Subscription timed out.");
                }
                sub.stop();
            }, settings.timeout);
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
            if (subRef.current) subRef.current.stop();
        };
    }, [ndk, pubkey, dTag]);

    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

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

            hls.on(Hls.Events.ERROR, (_event, data) => {
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
                        {/* Chat Input Placeholder - implement interaction later */}
                        <div className="chat-input-area">
                            <input type="text" placeholder="Login to chat..." disabled />
                            <button disabled>Post</button>
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

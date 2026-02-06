import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKKind, NDKRelaySet, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import Hls from 'hls.js';
import { ChatMessage } from '../Live/ChatMessage';
import './RoomPage.css';
import { LiveKitRoom, RoomAudioRenderer, ControlBar } from '@livekit/components-react';
import '@livekit/components-styles';
import { NestsApi } from '../../services/NestsApi';

const CONNECTION_TIMEOUT = 10000;

export const RoomPage = () => {
    const { pubkey, identifier } = useParams();
    const navigate = useNavigate();
    const dTag = identifier;
    const { ndk, isLoading, user, login } = useNostr();
    const [hostProfile, setHostProfile] = useState<any>(null);
    const [roomEvent, setRoomEvent] = useState<NDKEvent | null>(null);
    const roomEventRef = useRef<NDKEvent | null>(null);
    const [streamUrl, setStreamUrl] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<NDKEvent[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<string>('Initializing...');
    const [chatInput, setChatInput] = useState('');
    const [sending, setSending] = useState(false);
    const [reactions, setReactions] = useState<{ id: string; content: string; x: number }[]>([]);

    // Interactive Speaker State
    const [speakingRequests, setSpeakingRequests] = useState<NDKEvent[]>([]);
    const [myRequestStatus, setMyRequestStatus] = useState<'none' | 'requested' | 'granted' | 'denied'>('none');
    const [showRequestsPanel, setShowRequestsPanel] = useState(false);

    // Broadcaster State
    const [broadcastToken, setBroadcastToken] = useState<string>('');
    const [liveKitUrl, setLiveKitUrl] = useState<string>(''); // Dynamic URL

    const subRef = useRef<any>(null);
    const chatWindowRef = useRef<HTMLDivElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const connectionRef = useRef(false);

    useEffect(() => {
        if (isLoading || !ndk || !pubkey || !dTag) return;

        let isMounted = true;

        const fetchData = async () => {
            if (connectionRef.current) return;
            connectionRef.current = true;

            const cleanPubkey = pubkey.toLowerCase();
            const cleanDTag = dTag.toLowerCase();

            setConnectionStatus('Connecting...');

            const roomFilter: NDKFilter[] = [
                { kinds: [30311 as NDKKind, 30312 as NDKKind], authors: [cleanPubkey], '#d': [cleanDTag] },
                { kinds: [30311 as NDKKind, 30312 as NDKKind], '#p': [cleanPubkey], '#d': [cleanDTag] },
            ];

            const sub = ndk.subscribe(roomFilter, { closeOnEose: false });

            sub.on('event', (e) => {
                if (isMounted) handleRoomEvent(e);
                sub.stop();
            });

            setTimeout(() => {
                if (isMounted && !roomEventRef.current) {
                    setConnectionStatus('Room not found.');
                }
                sub.stop();
            }, CONNECTION_TIMEOUT);
        };

        const handleRoomEvent = async (event: NDKEvent) => {
            if (!isMounted) return;
            setRoomEvent(event);
            roomEventRef.current = event;
            setConnectionStatus('Joining room...');
            const url = event.getMatchingTags('streaming')[0]?.[1];
            setStreamUrl(url || null);

            const hostPubkey = event.getMatchingTags('p')[0]?.[1] || event.pubkey;
            ndk.getUser({ pubkey: hostPubkey }).fetchProfile().then(p => {
                if (isMounted) setHostProfile(p);
            });

            const aTag = `${event.kind}:${event.pubkey}:${event.getMatchingTags('d')[0]?.[1] || dTag}`; // Use dynamic kind/dtag ref
            const filter: NDKFilter = {
                kinds: [1311 as NDKKind, 7 as NDKKind, 1833 as NDKKind, 3979 as NDKKind],
                '#a': [aTag],
                limit: 100,
            };

            const chatSub = ndk.subscribe(filter, { closeOnEose: false });
            chatSub.on('event', (e: NDKEvent) => {
                if (!isMounted) return;

                // Handle Chat
                if (e.kind === 1311) {
                    setChatMessages(prev => {
                        if (prev.find(m => m.id === e.id)) return prev;
                        return [...prev, e].sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
                    });
                }
                // Handle Reactions
                else if (e.kind === 7) {
                    const reaction = {
                        id: Math.random().toString(),
                        content: e.content || '❤️',
                        x: Math.random() * 80 + 10,
                    };
                    setReactions(prev => [...prev, reaction]);
                    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== reaction.id)), 3000);
                }
                // Handle Speaking Requests (Kind 1833)
                else if (e.kind === 1833) {
                    const status = e.getMatchingTags('status')[0]?.[1];
                    if (status === 'requested') {
                        setSpeakingRequests(prev => {
                            if (prev.find(r => r.pubkey === e.pubkey && r.created_at! >= e.created_at!)) return prev;
                            // Keep only latest request per user
                            return [...prev.filter(r => r.pubkey !== e.pubkey), e];
                        });
                    }
                }
                // Handle Permissions (Kind 3979)
                else if (e.kind === 3979) {
                    const status = e.getMatchingTags('status')[0]?.[1];
                    const targetPubkey = e.getMatchingTags('p')[0]?.[1];

                    if (targetPubkey) {
                        // Update local user status
                        if (user && targetPubkey === user.pubkey) {
                            if (status === 'granted') setMyRequestStatus('granted');
                            else if (status === 'denied') setMyRequestStatus('denied');
                            else if (status === 'revoked') setMyRequestStatus('none');
                        }
                    }
                }
            });
            subRef.current = chatSub;
        };

        fetchData();

        return () => {
            isMounted = false;
            if (subRef.current) subRef.current.stop();
        };
    }, [ndk, pubkey, dTag, isLoading]);

    // HLS initialization
    useEffect(() => {
        if (!streamUrl || !audioRef.current) return;
        const audio = audioRef.current;

        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(streamUrl);
            hls.attachMedia(audio);
            hls.on(Hls.Events.ERROR, function (_event, data) {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.log("fatal network error encountered, trying to recover");
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.log("fatal media error encountered, trying to recover");
                            hls.recoverMediaError();
                            break;
                        default:
                            console.log("fatal error, cannot recover");
                            hls.destroy();
                            break;
                    }
                }
            });
            hlsRef.current = hls;
        } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
            audio.src = streamUrl;
            audio.addEventListener('error', (e) => {
                console.warn('Native HLS error:', e);
            });
        }
    }, [streamUrl]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(console.error);
        }
        setIsPlaying(!isPlaying);
    };

    const handleSendMessage = async () => {
        if (!ndk || !chatInput.trim() || !roomEvent) return;
        if (!user) { login(); return; }

        setSending(true);
        try {
            const event = new NDKEvent(ndk);
            event.kind = 1311;
            event.content = chatInput;
            const aTag = `30311:${roomEvent.pubkey}:${roomEvent.getMatchingTags('d')[0]?.[1]}`;
            event.tags = [['a', aTag, 'wss://relay.zap.stream'], ['client', 'MyNostrSpace']];
            await event.publish();
            setChatInput('');
        } catch (e) {
            console.error(e);
        } finally {
            setSending(false);
        }
    };

    const sendReaction = async (emoji: string) => {
        if (!ndk || !roomEvent) return;
        if (!user) { login(); return; }

        const event = new NDKEvent(ndk);
        event.kind = 7;
        event.content = emoji;
        const aTag = `30311:${roomEvent.pubkey}:${roomEvent.getMatchingTags('d')[0]?.[1]}`;
        event.tags = [['a', aTag, 'wss://relay.zap.stream'], ['p', roomEvent.pubkey]];
        await event.publish();
    };

    // --- Interactive Speakers Logic ---

    const handleRequestToSpeak = async () => {
        if (!ndk || !roomEvent || !user) { login(); return; }
        try {
            const event = new NDKEvent(ndk);
            event.kind = 1833;
            const aTag = `30312:${roomEvent.pubkey}:${roomEvent.getMatchingTags('d')[0]?.[1]}`;
            event.tags = [['a', aTag, '', 'root'], ['status', 'requested']];
            await event.publish();
            setMyRequestStatus('requested');
            alert('Request sent to host!');
        } catch (e) {
            console.error(e);
            alert('Failed to send request.');
        }
    };

    const handleGrantPermission = async (requesterPubkey: string) => {
        if (!ndk || !roomEvent) return;
        if (!user) {
            alert('You must be logged in to grant permissions.');
            return;
        }

        // 1. Call API to update backend permissions (Crucial for Token generation)
        try {
            await NestsApi.updateNestPermissions(user, roomEvent.getMatchingTags('d')[0]?.[1] || '', {
                participant: requesterPubkey,
                can_publish: true
            });
        } catch (e) {
            console.error('Failed to update backend permissions:', e);
            alert('Failed to grant permission on server. User may not be able to speak.');
            return;
        }

        // 2. Publish Nostr event for UI signaling
        const event = new NDKEvent(ndk);
        event.kind = 3979;
        const aTag = `30312:${roomEvent.pubkey}:${roomEvent.getMatchingTags('d')[0]?.[1]}`;
        event.tags = [['a', aTag, '', 'root'], ['p', requesterPubkey], ['status', 'granted']];
        await event.publish();

        // Optimistic UI update
        setSpeakingRequests(prev => prev.filter(r => r.pubkey !== requesterPubkey));
    };

    const handleDenyPermission = async (requesterPubkey: string) => {
        if (!ndk || !roomEvent) return;
        const event = new NDKEvent(ndk);
        event.kind = 3979;
        const aTag = `30312:${roomEvent.pubkey}:${roomEvent.getMatchingTags('d')[0]?.[1]}`;
        event.tags = [['a', aTag, '', 'root'], ['p', requesterPubkey], ['status', 'denied']];
        await event.publish();

        setSpeakingRequests(prev => prev.filter(r => r.pubkey !== requesterPubkey));
    };


    if (!roomEvent) {
        return (
            <div className="audio-room-loading-screen">
                <Navbar />
                <div className="loading-content">
                    <p>{connectionStatus}</p>
                </div>
            </div>
        );
    }

    const title = roomEvent.getMatchingTags('title')[0]?.[1] || 'Untitled Room';
    const summary = roomEvent.getMatchingTags('summary')[0]?.[1] || '';
    const image = roomEvent.getMatchingTags('image')[0]?.[1];
    const service = roomEvent.getMatchingTags('service')[0]?.[1] || '';
    const isHiveTalk = streamUrl?.includes('hivetalk') || service?.includes('hivetalk') || streamUrl?.includes('vanilla.hivetalk');

    return (
        <div className="home-page-container audio-room-page-container">
            <div className="home-wrapper audio-room-wrapper">
                <Navbar />
                <div className="myspace-body">
                    <div className="col-left">
                        <div className="profile-box">
                            <h3>{hostProfile?.name || 'Broadcaster'}</h3>
                            <div className="profile-pic">
                                <img src={hostProfile?.picture || `https://robohash.org/${pubkey}`} alt="Host" />
                            </div>
                            <div className="contact-links">
                                <Link to={`/p/${pubkey}`}>View Profile</Link>
                            </div>
                        </div>
                    </div>

                    <div className="col-right">
                        <div className="content-box audio-player-box">
                            <div className="box-header">
                                <h2>{title}</h2>
                            </div>
                            <div className="audio-visual-center">
                                {isHiveTalk ? (
                                    <div className="hivetalk-iframe-container">
                                        <iframe
                                            src={streamUrl || ''}
                                            className="hivetalk-iframe"
                                            allow="camera; microphone; display-capture; autoplay; clipboard-write"
                                            allowFullScreen
                                        />
                                        <a href={streamUrl || ''} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: '10px', textAlign: 'center', color: '#0066cc' }}>
                                            Open in new tab
                                        </a>
                                    </div>
                                ) : (
                                    <>
                                        <div className={`audio-cover ${isPlaying ? 'playing' : ''}`}>
                                            {image ? <img src={image} alt="Cover" /> : <div className="placeholder-icon">🎙️</div>}
                                            {isPlaying && <div className="audio-waves"><span></span><span></span><span></span></div>}
                                        </div>
                                        <button className="play-toggle-btn" onClick={togglePlay}>
                                            {isPlaying ? 'PAUSE' : 'LISTEN LIVE'}
                                        </button>
                                        <audio ref={audioRef} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
                                    </>
                                )}

                                {/* Listener Action Button */}
                                {user && user.pubkey !== roomEvent.pubkey && !broadcastToken && (
                                    <div style={{ marginTop: '15px' }}>
                                        {myRequestStatus === 'none' && (
                                            <button className="myspace-button" onClick={handleRequestToSpeak} style={{ fontSize: '0.9em', padding: '5px 15px' }}>
                                                ✋ Request to Speak
                                            </button>
                                        )}
                                        {myRequestStatus === 'requested' && (
                                            <span style={{ color: '#aaa', fontStyle: 'italic' }}>✋ Request Pending...</span>
                                        )}
                                        {myRequestStatus === 'granted' && (
                                            <button
                                                className="myspace-button"
                                                style={{ background: '#4CAF50' }}
                                                onClick={async () => {
                                                    try {
                                                        const roomId = roomEvent.getMatchingTags('d')[0]?.[1];
                                                        if (!roomId) return;

                                                        // 1. Get Info
                                                        const info = await NestsApi.getNestInfo(roomId);
                                                        if (info.server) setLiveKitUrl(info.server);

                                                        // 2. Join
                                                        const res = await NestsApi.joinNest(user, roomId);
                                                        setBroadcastToken(res.token);
                                                    } catch (e) {
                                                        console.error(e);
                                                        alert('Failed to join stage.');
                                                    }
                                                }}
                                            >
                                                🎙️ Permission Granted - JOIN STAGE
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Host Controls */}
                            {/* Active Broadcaster View (Host or Guest) */}
                            {broadcastToken ? (
                                <div className="live-studio" style={{ marginTop: '15px', width: '100%', padding: '10px', background: '#000', borderRadius: '8px' }}>
                                    <LiveKitRoom
                                        token={broadcastToken}
                                        serverUrl={liveKitUrl}
                                        connect={true}
                                        data-lk-theme="default"
                                        style={{ height: 'auto' }}
                                    >
                                        <div style={{ color: 'white', marginBottom: '5px', fontSize: '10pt', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>🔴 ON AIR</span>
                                            {user?.pubkey === roomEvent.pubkey && (
                                                <span style={{ cursor: 'pointer' }} onClick={() => setShowRequestsPanel(!showRequestsPanel)}>
                                                    👥 Requests ({speakingRequests.length})
                                                </span>
                                            )}
                                        </div>
                                        <RoomAudioRenderer />
                                        <ControlBar
                                            variation="minimal"
                                            controls={{ microphone: true, camera: false, screenShare: false, chat: false, leave: false, settings: false }}
                                        />
                                    </LiveKitRoom>

                                    {user?.pubkey === roomEvent.pubkey && showRequestsPanel && speakingRequests.length > 0 && (
                                        <div style={{ marginTop: '10px', background: '#222', padding: '10px', borderRadius: '5px', textAlign: 'left' }}>
                                            <h5 style={{ color: '#fff', margin: '0 0 5px 0' }}>Speaking Requests</h5>
                                            {speakingRequests.map(req => (
                                                <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                                    <span style={{ color: '#ccc', fontSize: '0.8em' }}>{req.pubkey.slice(0, 6)}...</span>
                                                    <div style={{ display: 'flex', gap: '5px' }}>
                                                        <button onClick={() => handleGrantPermission(req.pubkey)} style={{ padding: '2px 5px', background: '#4CAF50', border: 'none', color: 'white', borderRadius: '3px', cursor: 'pointer' }}>✓</button>
                                                        <button onClick={() => handleDenyPermission(req.pubkey)} style={{ padding: '2px 5px', background: '#f44336', border: 'none', color: 'white', borderRadius: '3px', cursor: 'pointer' }}>✗</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <button
                                        onClick={() => setBroadcastToken('')}
                                        style={{ marginTop: '10px', fontSize: '9pt', color: '#ccc', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                    >
                                        Leave Stage
                                    </button>
                                </div>
                            ) : (
                                /* Non-Broadcasting Host Control */
                                user?.pubkey === roomEvent.pubkey && (
                                    <div className="host-controls" style={{ marginTop: '15px', textAlign: 'center' }}>
                                        <button
                                            className="myspace-button"
                                            onClick={async () => {
                                                if (!user) return;
                                                try {
                                                    const roomId = roomEvent.getMatchingTags('d')[0]?.[1];
                                                    if (!roomId) return;

                                                    const streamingTags = roomEvent.getMatchingTags('streaming');
                                                    let serverUrl = streamingTags.find(t => t[1].startsWith('wss+livekit://') || t[1].startsWith('wss://') || t[1].startsWith('ws://'))?.[1];

                                                    if (serverUrl) {
                                                        serverUrl = serverUrl.replace('wss+livekit://', 'wss://');
                                                        setLiveKitUrl(serverUrl);
                                                    } else {
                                                        setLiveKitUrl('wss://nostrnests.com/livekit');
                                                    }

                                                    const res = await NestsApi.joinNest(user, roomId);
                                                    setBroadcastToken(res.token);
                                                } catch (e) {
                                                    console.error('Failed to start broadcast:', e);
                                                    alert('Could not start broadcast. Check console for details.');
                                                }
                                            }}
                                        >
                                            Start Broadcasting 🎙️
                                        </button>
                                    </div>
                                )
                            )}

                            {/* End Room Button (Host Only) - For Video/Audio Rooms */}
                            {user?.pubkey === roomEvent.pubkey && (roomEvent.kind === 30311 || roomEvent.kind === 30312 || roomEvent.kind === (30311 as NDKKind) || roomEvent.kind === (30312 as NDKKind)) && (
                                <div style={{ marginTop: '15px', textAlign: 'center' }}>
                                    <button
                                        onClick={async () => {
                                            if (!ndk || !roomEvent || !user) {
                                                console.error('handleEndRoom: missing requirements', { ndk: !!ndk, roomEvent: !!roomEvent, user: !!user });
                                                alert('Cannot end room: missing required authentication');
                                                return;
                                            }

                                            if (!confirm('Are you sure you want to END this audio room?')) return;

                                            try {
                                                console.log('Attempting to end room:', roomEvent.id);
                                                const event = new NDKEvent(ndk);
                                                event.kind = roomEvent.kind; // Use same kind as original event
                                                event.tags = [
                                                    ...roomEvent.tags.filter(t => t[0] !== 'status'),
                                                    ['status', 'ended']
                                                ];
                                                console.log('Publishing end room event...', event);
                                                await event.publish();
                                                console.log('Room ended successfully');
                                                alert('Room ended.');
                                                navigate('/rooms');
                                            } catch (e) {
                                                console.error('Failed to end room:', e);
                                                alert(`Failed to end room: ${e}`);
                                            }
                                        }}
                                        style={{
                                            background: '#cc0000',
                                            color: 'white',
                                            border: '2px solid #990000',
                                            padding: '5px 15px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            marginTop: '10px'
                                        }}
                                    >
                                        END ROOM
                                    </button>
                                </div>
                            )}

                            {/* KILL Button (Host Only) - For Video Rooms (Kind 30311) OR stuck Audio Rooms */}
                            {user?.pubkey === roomEvent.pubkey && (
                                <div style={{ marginTop: '15px', textAlign: 'center' }}>
                                    <button
                                        onClick={async () => {
                                            if (!ndk || !roomEvent || !user) {
                                                console.error('handleKillRoom: missing requirements', { ndk: !!ndk, roomEvent: !!roomEvent, user: !!user });
                                                alert('Cannot delete room: missing required authentication');
                                                return;
                                            }

                                            if (!confirm('Are you sure you want to KILL/DELETE this room event?')) return;

                                            try {
                                                console.log('Attempting to delete event:', roomEvent.id);
                                                const actualDTag = roomEvent.getMatchingTags('d')[0]?.[1] || dTag || '';

                                                const event = new NDKEvent(ndk);
                                                event.kind = 5; // EventDeletion
                                                event.tags = [
                                                    ['e', roomEvent.id],
                                                    ['a', `${roomEvent.kind}:${roomEvent.pubkey}:${actualDTag}`],
                                                    ['k', roomEvent.kind?.toString() || '30312']
                                                ];
                                                event.content = 'Deleting audio room';

                                                console.log('Publishing deletion event to all relays...', event);

                                                // Publish to multiple major relays explicitly
                                                const relayUrls = [
                                                    'wss://relay.damus.io',
                                                    'wss://relay.primal.net',
                                                    'wss://relay.nostr.band',
                                                    'wss://nos.lol',
                                                    'wss://relay.snort.social'
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
                                                alert(`Room deletion broadcasted to ${successCount} relays! The room should disappear within a few seconds.`);
                                                navigate('/rooms');
                                            } catch (e) {
                                                console.error('Signer error or publish failed:', e);
                                                alert(`Failed to trigger signer: ${e}`);
                                            }
                                        }}
                                        style={{
                                            background: 'red',
                                            color: 'white',
                                            border: '2px solid darkred',
                                            padding: '5px 15px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            marginTop: '10px',
                                            marginLeft: '10px'
                                        }}
                                    >
                                        ☠️ DELETE EVENT (Hard Kill)
                                    </button>
                                </div>
                            )}

                            <div className="room-summary">
                                <p>{summary}</p>
                            </div>

                            <div className="reaction-bar">
                                {['❤️', '🔥', '👏', '😂', '😮', '🙌'].map(emoji => (
                                    <button key={emoji} onClick={() => sendReaction(emoji)}>{emoji}</button>
                                ))}
                            </div>
                        </div>

                        <div className="content-box chat-box">
                            <div className="box-header"><h2>Room Chat</h2></div>
                            <div className="chat-window" ref={chatWindowRef}>
                                {chatMessages.length === 0 ? <div className="empty-chat">No messages yet.</div> :
                                    chatMessages.map(msg => <ChatMessage key={msg.id} msg={msg} />)}
                            </div>
                            <div className="chat-input-area">
                                <input className="nostr-input" type="text" placeholder="Say something..." value={chatInput}
                                    onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} />
                                <button className="post-button" onClick={handleSendMessage} disabled={sending || !chatInput.trim()}>
                                    {sending ? '...' : 'Post'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Floating Reactions Layer */}
                <div className="floating-reactions-container">
                    {reactions.map(r => (
                        <div key={r.id} className="floating-reaction" style={{ left: `${r.x}%` }}>
                            {r.content}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

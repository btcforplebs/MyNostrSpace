import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKKind, NDKRelaySet, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import Hls from 'hls.js';
import { ChatMessage } from '../Live/ChatMessage';
import { Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrackPublication } from 'livekit-client';
import { NestsApi } from '../../services/NestsApi';
import './RoomPage.css';

const CONNECTION_TIMEOUT = 10000;

interface ParticipantInfo {
    identity: string;
    isSpeaking: boolean;
    isMuted: boolean;
    canPublish: boolean;
    displayName?: string;
    avatar?: string;
}

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
    const [connectionStatus, setConnectionStatus] = useState<string>('Initializing...');
    const [chatInput, setChatInput] = useState('');
    const [sending, setSending] = useState(false);
    const [reactions, setReactions] = useState<{ id: string; content: string; x: number }[]>([]);

    // LiveKit state
    const [lkConnected, setLkConnected] = useState(false);
    const [micEnabled, setMicEnabled] = useState(false);
    const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
    const [joining, setJoining] = useState(false);
    const lkRoomRef = useRef<Room | null>(null);

    // HLS fallback state (for when not connected via LiveKit)
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const hlsRef = useRef<Hls | null>(null);

    const subRef = useRef<any>(null);
    const chatWindowRef = useRef<HTMLDivElement>(null);
    const connectionRef = useRef(false);

    // Sync participants from LiveKit room
    const syncParticipants = useCallback(() => {
        const room = lkRoomRef.current;
        if (!room) return;

        const all: ParticipantInfo[] = [];

        // Local participant
        const local = room.localParticipant;
        all.push({
            identity: local.identity,
            isSpeaking: local.isSpeaking,
            isMuted: !local.isMicrophoneEnabled,
            canPublish: local.permissions?.canPublish ?? false,
        });

        // Remote participants
        room.remoteParticipants.forEach((p: RemoteParticipant) => {
            all.push({
                identity: p.identity,
                isSpeaking: p.isSpeaking,
                isMuted: !p.isMicrophoneEnabled,
                canPublish: p.permissions?.canPublish ?? false,
            });
        });

        setParticipants(all);
    }, []);

    // Fetch profiles for participants
    useEffect(() => {
        if (!ndk || participants.length === 0) return;

        participants.forEach((p) => {
            if (p.displayName || p.identity.startsWith('guest-') || !p.identity) return;
            ndk.getUser({ pubkey: p.identity }).fetchProfile().then((profile) => {
                if (profile) {
                    setParticipants(prev => prev.map(pp =>
                        pp.identity === p.identity
                            ? { ...pp, displayName: profile.name || profile.displayName, avatar: profile.image }
                            : pp
                    ));
                }
            }).catch(() => { });
        });
    }, [ndk, participants.length]);

    // Join LiveKit room
    const joinLiveKit = useCallback(async (asGuest = false) => {
        if (!user && !asGuest) { login(); return; }
        if (!roomEvent) return;

        const roomId = roomEvent.getMatchingTags('d')[0]?.[1];
        if (!roomId) return;

        setJoining(true);
        try {
            // Get token from Nests API
            let token: string;
            if (asGuest) {
                const res = await fetch(`https://nostrnests.com/api/v1/nests/${roomId}/guest`);
                const data = await res.json();
                token = data.token;
            } else {
                const res = await NestsApi.joinNest(user!, roomId);
                token = res.token;
            }

            // Find LiveKit server URL from streaming tags
            const streamingTags = roomEvent.getMatchingTags('streaming');
            let serverUrl = streamingTags.find(t =>
                t[1]?.startsWith('wss+livekit://') || t[1]?.startsWith('ws+livekit://')
            )?.[1];

            if (serverUrl) {
                serverUrl = serverUrl.replace('+livekit', '');
            } else {
                serverUrl = 'wss://nostrnests.com';
            }

            // Connect to LiveKit
            const room = new Room();
            lkRoomRef.current = room;

            // Set up event listeners
            room.on(RoomEvent.ParticipantConnected, syncParticipants);
            room.on(RoomEvent.ParticipantDisconnected, syncParticipants);
            room.on(RoomEvent.TrackMuted, syncParticipants);
            room.on(RoomEvent.TrackUnmuted, syncParticipants);
            room.on(RoomEvent.TrackPublished, syncParticipants);
            room.on(RoomEvent.TrackUnpublished, syncParticipants);
            room.on(RoomEvent.ActiveSpeakersChanged, syncParticipants);
            room.on(RoomEvent.ParticipantPermissionsChanged, syncParticipants);

            // Auto-play remote audio tracks
            room.on(RoomEvent.TrackSubscribed, (track, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
                if (track.kind === Track.Kind.Audio) {
                    const el = track.attach();
                    document.body.appendChild(el);
                    el.style.display = 'none';
                }
                syncParticipants();
            });

            room.on(RoomEvent.Disconnected, () => {
                setLkConnected(false);
                setMicEnabled(false);
                setParticipants([]);
            });

            await room.connect(serverUrl, token);
            setLkConnected(true);

            // Stop HLS if it was playing
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            if (audioRef.current) {
                audioRef.current.pause();
                setIsPlaying(false);
            }

            syncParticipants();

            // If host and has publish permission, enable mic
            const isHost = user?.pubkey === roomEvent.pubkey;
            if (isHost && room.localParticipant.permissions?.canPublish) {
                await room.localParticipant.setMicrophoneEnabled(true);
                setMicEnabled(true);
            }
        } catch (e) {
            console.error('Failed to join LiveKit room:', e);
            alert(`Failed to join room: ${e}`);
        } finally {
            setJoining(false);
        }
    }, [user, roomEvent, login, syncParticipants]);

    // Toggle microphone
    const toggleMic = useCallback(async () => {
        const room = lkRoomRef.current;
        if (!room) return;

        const newState = !micEnabled;
        await room.localParticipant.setMicrophoneEnabled(newState);
        setMicEnabled(newState);
        syncParticipants();
    }, [micEnabled, syncParticipants]);

    // Disconnect from LiveKit on unmount
    useEffect(() => {
        return () => {
            if (lkRoomRef.current) {
                lkRoomRef.current.disconnect();
                lkRoomRef.current = null;
            }
        };
    }, []);

    // Fetch room event from relays
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
            setConnectionStatus('Room found.');
            const url = event.getMatchingTags('streaming').find(t => t[1]?.includes('.m3u8'))?.[1];
            setStreamUrl(url || null);

            const hostPubkey = event.getMatchingTags('p')[0]?.[1] || event.pubkey;
            ndk.getUser({ pubkey: hostPubkey }).fetchProfile().then(p => {
                if (isMounted) setHostProfile(p);
            });

            const aTag = `${event.kind}:${event.pubkey}:${event.getMatchingTags('d')[0]?.[1] || dTag}`;
            const filter: NDKFilter = {
                kinds: [1311 as NDKKind, 7 as NDKKind],
                '#a': [aTag],
                limit: 100,
            };

            const chatSub = ndk.subscribe(filter, { closeOnEose: false });
            chatSub.on('event', (e: NDKEvent) => {
                if (!isMounted) return;

                if (e.kind === 1311) {
                    setChatMessages(prev => {
                        if (prev.find(m => m.id === e.id)) return prev;
                        return [...prev, e].sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
                    });
                } else if (e.kind === 7) {
                    const reaction = {
                        id: Math.random().toString(),
                        content: e.content || '❤️',
                        x: Math.random() * 80 + 10,
                    };
                    setReactions(prev => [...prev, reaction]);
                    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== reaction.id)), 3000);
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

    // HLS initialization (fallback for passive listeners)
    useEffect(() => {
        if (!streamUrl || !audioRef.current || lkConnected) return;

        const audio = audioRef.current;

        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(streamUrl);
            hls.attachMedia(audio);
            hls.on(Hls.Events.ERROR, function (_event, data) {
                if (data.fatal) {
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        hls.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else {
                        hls.destroy();
                    }
                }
            });
            hlsRef.current = hls;
        } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
            audio.src = streamUrl;
        }
    }, [streamUrl, lkConnected]);

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
            const aTag = `${roomEvent.kind}:${roomEvent.pubkey}:${roomEvent.getMatchingTags('d')[0]?.[1]}`;
            event.tags = [['a', aTag], ['client', 'MyNostrSpace']];
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
        const aTag = `${roomEvent.kind}:${roomEvent.pubkey}:${roomEvent.getMatchingTags('d')[0]?.[1]}`;
        event.tags = [['a', aTag], ['p', roomEvent.pubkey]];
        await event.publish();
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

    const ROOM_RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol', 'wss://relay.nostr.band'];

    const title = roomEvent.getMatchingTags('title')[0]?.[1] || 'Untitled Room';
    const summary = roomEvent.getMatchingTags('summary')[0]?.[1] || '';
    const image = roomEvent.getMatchingTags('image')[0]?.[1];
    const service = roomEvent.getMatchingTags('service')[0]?.[1] || '';
    const isNests = service?.includes('nostrnests') || roomEvent.kind === 30312;
    const isHost = user?.pubkey === roomEvent.pubkey;

    const speakers = participants.filter(p => p.canPublish);
    const listeners = participants.filter(p => !p.canPublish);

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
                                {lkConnected ? (
                                    /* Native LiveKit audio room */
                                    <div className="lk-room-container">
                                        <div className="broadcast-indicator">
                                            🔴 Connected
                                        </div>

                                        {/* Speakers */}
                                        {speakers.length > 0 && (
                                            <div className="participants-section">
                                                <div className="participants-label">Speakers</div>
                                                <div className="participants-grid">
                                                    {speakers.map(p => (
                                                        <div key={p.identity} className={`participant-card ${p.isSpeaking ? 'speaking' : ''}`}>
                                                            <img
                                                                src={p.avatar || `https://robohash.org/${p.identity}`}
                                                                alt=""
                                                                className="participant-avatar"
                                                            />
                                                            <div className="participant-name">
                                                                {p.displayName || p.identity.slice(0, 8)}
                                                            </div>
                                                            <div className="participant-status">
                                                                {p.isMuted ? '🔇' : '🎙️'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Listeners */}
                                        {listeners.length > 0 && (
                                            <div className="participants-section">
                                                <div className="participants-label">Listeners ({listeners.length})</div>
                                                <div className="participants-grid listeners">
                                                    {listeners.map(p => (
                                                        <div key={p.identity} className="participant-card small">
                                                            <img
                                                                src={p.avatar || `https://robohash.org/${p.identity}`}
                                                                alt=""
                                                                className="participant-avatar small"
                                                            />
                                                            <div className="participant-name">
                                                                {p.displayName || p.identity.slice(0, 6)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Mic toggle (for speakers/host) */}
                                        {lkRoomRef.current?.localParticipant.permissions?.canPublish && (
                                            <button
                                                className={`mic-toggle-btn ${micEnabled ? 'active' : 'muted'}`}
                                                onClick={toggleMic}
                                            >
                                                {micEnabled ? '🎙️ Mute' : '🔇 Unmute'}
                                            </button>
                                        )}

                                        <button
                                            onClick={() => {
                                                lkRoomRef.current?.disconnect();
                                                setLkConnected(false);
                                                setParticipants([]);
                                            }}
                                            className="leave-btn"
                                        >
                                            Leave Room
                                        </button>
                                    </div>
                                ) : (
                                    /* Not connected - show join button + HLS fallback */
                                    <>
                                        <div className={`audio-cover ${isPlaying ? 'playing' : ''}`}>
                                            {image ? <img src={image} alt="Cover" /> : <div className="placeholder-icon">🎙️</div>}
                                            {isPlaying && <div className="audio-waves"><span></span><span></span><span></span></div>}
                                        </div>

                                        {/* Join room via LiveKit (Nests rooms) */}
                                        {isNests && (
                                            <div style={{ display: 'flex', gap: '10px', marginTop: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                <button
                                                    className="myspace-button"
                                                    onClick={() => joinLiveKit(false)}
                                                    disabled={joining}
                                                >
                                                    {joining ? 'Joining...' : (isHost ? 'Join & Broadcast 🎙️' : 'Join Room')}
                                                </button>
                                                {!user && (
                                                    <button
                                                        className="myspace-button"
                                                        style={{ background: '#ccc', borderColor: '#999' }}
                                                        onClick={() => joinLiveKit(true)}
                                                        disabled={joining}
                                                    >
                                                        {joining ? 'Joining...' : 'Join as Guest'}
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* HLS listen button (fallback) */}
                                        {streamUrl && (
                                            <div style={{ marginTop: '10px' }}>
                                                <button className="play-toggle-btn" onClick={togglePlay} style={{ fontSize: '10pt', padding: '5px 15px' }}>
                                                    {isPlaying ? 'Pause HLS' : 'Listen via HLS'}
                                                </button>
                                                <audio ref={audioRef} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Host controls */}
                            {isHost && (
                                <div style={{ marginTop: '15px', textAlign: 'center' }}>
                                    <button
                                        onClick={async () => {
                                            if (!ndk || !roomEvent || !user) return;
                                            if (!confirm('Are you sure you want to END this room?')) return;
                                            try {
                                                const connectedRelays = ndk.pool.connectedRelays().map(r => r.url);
                                                const allRelays = [...new Set([...ROOM_RELAYS, ...connectedRelays])];
                                                const event = new NDKEvent(ndk);
                                                event.kind = roomEvent.kind;
                                                event.tags = [...roomEvent.tags.filter(t => t[0] !== 'status'), ['status', 'ended']];
                                                await event.publish(NDKRelaySet.fromRelayUrls(allRelays, ndk));
                                                lkRoomRef.current?.disconnect();
                                                navigate('/rooms');
                                            } catch (e) {
                                                console.error('Failed to end room:', e);
                                                alert(`Failed to end room: ${e}`);
                                            }
                                        }}
                                        style={{ background: '#cc0000', color: 'white', border: '2px solid #990000', padding: '5px 15px', fontWeight: 'bold', cursor: 'pointer' }}
                                    >
                                        END ROOM
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!ndk || !roomEvent || !user) return;
                                            if (!confirm('DELETE this room event?')) return;
                                            try {
                                                const actualDTag = roomEvent.getMatchingTags('d')[0]?.[1] || dTag || '';
                                                const event = new NDKEvent(ndk);
                                                event.kind = 5;
                                                event.tags = [['e', roomEvent.id], ['a', `${roomEvent.kind}:${roomEvent.pubkey}:${actualDTag}`], ['k', roomEvent.kind?.toString() || '30312']];
                                                event.content = 'Deleting room';
                                                const delConnected = ndk.pool.connectedRelays().map(r => r.url);
                                                const delRelays = [...new Set([...ROOM_RELAYS, ...delConnected])];
                                                await event.publish(NDKRelaySet.fromRelayUrls(delRelays, ndk));
                                                lkRoomRef.current?.disconnect();
                                                navigate('/rooms');
                                            } catch (e) {
                                                console.error('Failed to delete room:', e);
                                                alert(`Failed: ${e}`);
                                            }
                                        }}
                                        style={{ background: 'red', color: 'white', border: '2px solid darkred', padding: '5px 15px', fontWeight: 'bold', cursor: 'pointer', marginLeft: '10px' }}
                                    >
                                        DELETE EVENT
                                    </button>
                                </div>
                            )}

                            <div className="room-summary"><p>{summary}</p></div>

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

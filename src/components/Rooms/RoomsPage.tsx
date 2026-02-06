import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, type NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import { SEO } from '../Shared/SEO';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import './RoomsPage.css';
import { NestsApi } from '../../services/NestsApi';

interface AudioRoom {
    id: string;
    pubkey: string;
    dTag: string;
    title: string;
    summary: string;
    image: string;
    status: string;
    streaming: string;
    streamingType: string;
    isAudio: boolean;
    isVideo: boolean;
    service: string;
    hostName?: string;
    participants: number;
    created_at: number;
    kind: number;
}

export const RoomsPage = () => {
    const { ndk, user: loggedInUser, login } = useNostr();
    const navigate = useNavigate();
    const { layoutCss } = useCustomLayout(loggedInUser?.pubkey);
    const [rooms, setRooms] = useState<AudioRoom[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Form state for modal
    const [newRoomTitle, setNewRoomTitle] = useState('');
    const [newRoomSummary, setNewRoomSummary] = useState('');
    const [newRoomImage, setNewRoomImage] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [newRoomStatus, setNewRoomStatus] = useState<'live' | 'planned'>('live');
    const [newRoomStarts, setNewRoomStarts] = useState<string>('');
    const [newRoomTags, setNewRoomTags] = useState('');
    const [newRoomService, setNewRoomService] = useState<'nests' | 'hivetalk'>('nests');

    const roomBufferRef = useRef<AudioRoom[]>([]);
    const isUpdatePendingRef = useRef(false);

    const processBuffer = useCallback(() => {
        if (roomBufferRef.current.length === 0) return;

        setRooms((prev) => {
            const next = [...prev];
            let changed = false;

            for (const room of roomBufferRef.current) {
                // Dedupe by pubkey:dTag
                const key = `${room.pubkey}:${room.dTag}`;
                const existingIdx = next.findIndex((r) => `${r.pubkey}:${r.dTag}` === key);
                if (existingIdx >= 0) {
                    // Update existing room if newer
                    if (room.created_at > next[existingIdx].created_at) {
                        next[existingIdx] = room;
                        changed = true;
                    }
                } else {
                    next.push(room);
                    changed = true;
                }
            }

            roomBufferRef.current = [];
            isUpdatePendingRef.current = false;

            if (!changed) return prev;
            // Sort by live first, then by created_at
            return next.sort((a, b) => {
                if (a.status === 'live' && b.status !== 'live') return -1;
                if (b.status === 'live' && a.status !== 'live') return 1;
                return b.created_at - a.created_at;
            });
        });
    }, []);

    const handleRoomEvent = useCallback(
        (event: NDKEvent) => {
            const dTag = event.getMatchingTags('d')[0]?.[1];
            if (!dTag) return;

            const title = event.getMatchingTags('title')[0]?.[1] || 'Untitled Room';
            const summary = event.getMatchingTags('summary')[0]?.[1] || '';
            const image = event.getMatchingTags('image')[0]?.[1] || '';
            const status = event.getMatchingTags('status')[0]?.[1] || 'ended';
            const streaming = event.getMatchingTags('streaming')[0]?.[1] || '';
            const service = event.getMatchingTags('service')[0]?.[1] || '';

            // Get streaming type from t tags (NIP-53)
            const tTags = event.getMatchingTags('t').map(t => t[1]?.toLowerCase() || '');
            const isAudio = tTags.some(t => ['audio', 'music', 'podcast', 'radio'].includes(t));
            const isVideo = tTags.some(t => t === 'video');
            const streamingType = isVideo ? 'video' : (isAudio ? 'audio' : '');

            // Count participants from p tags
            const pTags = event.getMatchingTags('p');
            const participants = pTags.length;

            // Determine room service
            let detectedService = 'Unknown';
            if (streaming.includes('hivetalk') || service.includes('hivetalk') || streaming.includes('vanilla.hivetalk')) {
                detectedService = 'HiveTalk';
            } else if (streaming.includes('cornychat') || service.includes('cornychat')) {
                detectedService = 'Corny Chat';
            } else if (streaming.includes('nostrnests') || service.includes('nostrnests')) {
                detectedService = 'Nostr Nests';
            } else if (streaming.includes('zap.stream')) {
                detectedService = 'Zap.stream';
            }

            // If it's Kind 30312, it's definitely Nostr Nests
            if (event.kind === 30312) {
                detectedService = 'Nostr Nests';
            }

            const room: AudioRoom = {
                id: event.id,
                pubkey: event.pubkey,
                dTag,
                title,
                summary,
                image,
                status,
                streaming,
                streamingType,
                isAudio,
                isVideo,
                service: detectedService,
                kind: event.kind,
                participants,
                created_at: event.created_at || 0,
            };

            roomBufferRef.current.push(room);
            if (!isUpdatePendingRef.current) {
                isUpdatePendingRef.current = true;
                setTimeout(processBuffer, 300);
            }

            // Fetch host profile
            ndk
                ?.getUser({ pubkey: event.pubkey })
                .fetchProfile()
                .then((profile) => {
                    setRooms((prev) =>
                        prev.map((r) =>
                            r.id === event.id && !r.hostName
                                ? {
                                    ...r,
                                    hostName:
                                        profile?.name ||
                                        profile?.displayName ||
                                        event.pubkey.slice(0, 8),
                                }
                                : r
                        )
                    );
                })
                .catch(() => { });
        },
        [ndk, processBuffer]
    );

    useEffect(() => {
        if (!ndk) return;

        setLoading(true);

        // Fetch Kind 30311 (Live Activities) and 30312 (Nostr Nests)
        const filter: NDKFilter = {
            kinds: [30311 as number, 30312 as number],
            limit: 100,
        };

        const sub = ndk.subscribe(filter, {
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.PARALLEL,
        });

        sub.on('event', handleRoomEvent);
        sub.on('eose', () => {
            setLoading(false);
            processBuffer();
        });

        return () => {
            sub.stop();
        };
    }, [ndk, handleRoomEvent, processBuffer]);

    // Filter to show ONLY Corny Chat and Nostr Nests audio rooms
    // Strictly exclude everything else (Zap.stream, YouTube, Twitch, etc.)
    const audioRooms = rooms.filter((r) => {
        // EXPLICITLY exclude generic Kind 30311 video streams (Zap.stream, etc.)
        if (r.kind === 30311) {
            const isVideo = r.isVideo || r.service?.toLowerCase().includes('zap.stream') || r.streaming?.includes('zap.stream');
            if (isVideo) return false;

            // Whitelist known audio services for Kind 30311
            const isWhitelisted =
                r.service === 'Corny Chat' ||
                r.service === 'MyNostrSpace' ||
                r.service === 'HiveTalk' ||
                r.isAudio; // Explicitly tagged as audio

            if (!isWhitelisted) return false;
        }

        // Always allow Kind 30312 (Nostr Nests)
        return true;
    });
    const liveRooms = audioRooms.filter((r) => r.status === 'live');
    const recentRooms = audioRooms.filter((r) => r.status !== 'live');

    const handleJoinRoom = (room: AudioRoom) => {
        // Use native player for our own rooms, Nostr Nests rooms, or rooms with HLS URLs
        const isHls = room.streaming?.endsWith('.m3u8') || room.streaming?.includes('.m3u8?');
        const isNative =
            room.service === 'MyNostrSpace' ||
            room.service === 'Unknown' ||
            room.service === 'Nostr Nests' ||
            isHls;

        if (isNative) {
            navigate(`/room/${room.pubkey}/${room.dTag}`);
        } else if (room.service === 'HiveTalk') {
            navigate(`/room/${room.pubkey}/${room.dTag}`);
        } else if (room.streaming) {
            window.open(room.streaming, '_blank');
        } else if (room.service === 'Corny Chat') {
            window.open(`https://cornychat.com/${room.dTag}`, '_blank');
        }
    };

    const handleKillRoom = async (room: AudioRoom) => {
        if (!ndk || !loggedInUser) {
            console.error('handleKillRoom: missing requirements', { ndk: !!ndk, loggedInUser: !!loggedInUser });
            return;
        }

        if (!confirm(`Are you sure you want to KILL room "${room.title}"?\nThis will delete the event for everyone.`)) return;

        try {
            console.log('Attempting to delete room event:', room.id);
            const event = new NDKEvent(ndk);
            event.kind = 5; // EventDeletion
            event.tags = [
                ['e', room.id],
                ['a', `${room.kind}:${room.pubkey}:${room.dTag}`]
            ];

            console.log('Publishing deletion event...', event);
            await event.publish();
            console.log('Deletion published.');

            alert('Room kill signal sent.');
            // Remove from local state immediately
            setRooms(prev => prev.filter(r => r.id !== room.id));
        } catch (e) {
            console.error('Failed to kill room (signer error or publish failed):', e);
            alert(`Failed to kill room: ${e}`);
        }
    };

    const myLiveRooms = rooms.filter(r => r.status === 'live' && r.pubkey === loggedInUser?.pubkey);

    const handleCreateRoom = async () => {
        if (!ndk || !loggedInUser) {
            login();
            return;
        }

        if (!newRoomTitle) {
            alert('Title is required.');
            return;
        }

        setIsCreating(true);

        try {
            if (newRoomService === 'hivetalk') {
                // HiveTalk: Generate random room ID and redirect to HiveTalk
                const roomId = crypto.randomUUID().slice(0, 8);
                const hiveTalkUrl = `https://vanilla.hivetalk.org/join/${roomId}`;
                const unixNow = Math.floor(Date.now() / 1000);
                let startTimestamp = unixNow;

                if (newRoomStatus === 'planned' && newRoomStarts) {
                    startTimestamp = Math.floor(new Date(newRoomStarts).getTime() / 1000);
                }

                const tags = [
                    ['d', roomId],
                    ['title', newRoomTitle],
                    ['summary', newRoomSummary],
                    ['status', newRoomStatus === 'live' ? 'live' : 'planned'],
                    ['starts', startTimestamp.toString()],
                    ['service', 'https://vanilla.hivetalk.org'],
                    ['streaming', hiveTalkUrl],
                    ['t', 'video'],
                    ['t', 'audio'],
                    ['p', loggedInUser.pubkey, '', 'Host']
                ];

                if (newRoomImage) tags.push(['image', newRoomImage]);

                // Process hashtags
                const userTags = newRoomTags.split(',').map(t => t.trim()).filter(t => t);
                userTags.forEach(t => tags.push(['t', t]));

                const event = new NDKEvent(ndk);
                event.kind = 30311; // Use Kind 30311 for HiveTalk (standard live activity)
                event.tags = tags;

                const relays = ['wss://relay.damus.io', 'wss://relay.primal.net', ...ndk.pool.connectedRelays().map(r => r.url)];
                await event.publish(NDKRelaySet.fromRelayUrls(relays, ndk));

                console.log('HiveTalk room event published:', roomId);
                alert('Room created! Opening HiveTalk...');
                window.open(hiveTalkUrl, '_blank');
                navigate(`/room/${loggedInUser.pubkey}/${roomId}`);
            } else {
                // 1. Provision room via Nostr Nests API
                const nest = await NestsApi.createNest(loggedInUser, {
                    relays: loggedInUser.ndk?.pool.connectedRelays().map(r => r.url) || [],
                    hls_stream: true
                });

                console.log('Nest created:', nest);

                // 2. Publish Kind 30312 Event
                const roomId = nest.roomId;
                const unixNow = Math.floor(Date.now() / 1000);
                let startTimestamp = unixNow;

                if (newRoomStatus === 'planned' && newRoomStarts) {
                    startTimestamp = Math.floor(new Date(newRoomStarts).getTime() / 1000);
                }

                const tags = [
                    ['d', roomId],
                    ['title', newRoomTitle],
                    ['summary', newRoomSummary],
                    ['status', newRoomStatus === 'live' ? 'open' : 'closed'], // Nests requires 'open', 'private', or 'closed'
                    ['starts', startTimestamp.toString()],
                    ['service', 'https://nostrnests.com/api/v1/nests'], // Use Nests API identifier
                    ['t', 'audio'],
                    ['room', newRoomTitle], // Nests convention
                    ['p', loggedInUser.pubkey, '', 'Host']
                ];

                if (newRoomImage) tags.push(['image', newRoomImage]);

                // Add stream URLs (Prioritize m3u8)
                const hlsEndpoint = nest.endpoints.find(u => u.includes('.m3u8'));
                if (hlsEndpoint) tags.push(['streaming', hlsEndpoint]);

                // Add other endpoints as backup
                nest.endpoints.filter(u => !u.includes('.m3u8')).forEach(url => tags.push(['streaming', url]));

                // Process hashtags
                const userTags = newRoomTags.split(',').map(t => t.trim()).filter(t => t);
                userTags.forEach(t => tags.push(['t', t]));
                const event = new NDKEvent(ndk);
                event.kind = 30312; // Use Kind 30312 (Nostr Nests Standard)
                event.tags = tags;

                // Critical: Publish to global relays. Note: relay.nostrnests.com is currently offline/invalid
                const relays = ['wss://relay.damus.io', 'wss://relay.primal.net', ...ndk.pool.connectedRelays().map(r => r.url)];

                await event.publish(NDKRelaySet.fromRelayUrls(relays, ndk));
                console.log('Room event published to Nests & Global Relays:', roomId);

                alert('Room created! Redirecting you to start broadcasting...');
                navigate(`/room/${loggedInUser.pubkey}/${roomId}`);
            }
            setShowCreateModal(false);
            setNewRoomTitle('');
            setNewRoomSummary('');
            setNewRoomImage('');
            setNewRoomStatus('live');
            setNewRoomStarts('');
            setNewRoomTags('');
            setNewRoomService('nests');
        } catch (e) {
            console.error('Error creating room:', e);
            alert('Failed to create room. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="home-page-container audio-rooms-container">
            {layoutCss && <style>{layoutCss}</style>}
            <SEO title="Rooms" description="Join live rooms on Nostr - Corny Chat, Nostr Nests, HiveTalk, and more." />

            <div className="home-wrapper audio-rooms-wrapper">
                <Navbar />

                <div className="home-content audio-rooms-content">
                    <div className="audio-rooms-header-flex">
                        <div>
                            <h2 className="audio-rooms-section-header">Rooms</h2>
                            <p className="audio-rooms-subtitle">
                                Join live conversations on Nostr
                            </p>
                        </div>
                        <button
                            className="create-room-button"
                            onClick={() => {
                                if (loggedInUser) {
                                    setShowCreateModal(true);
                                } else {
                                    login();
                                }
                            }}
                        >
                            + Create Room
                        </button>
                    </div>

                    {/* Emergency Stop / My Active Rooms Section */}
                    {loggedInUser && myLiveRooms.length > 0 && (
                        <div style={{ margin: '20px 0', padding: '15px', background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '8px' }}>
                            <h3 style={{ color: '#cc0000', margin: '0 0 10px 0' }}>⚠️ My Active Rooms (Emergency Stop)</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
                                {myLiveRooms.map(room => (
                                    <div key={room.id} style={{ background: 'white', padding: '10px', border: '1px solid #ddd', borderRadius: '5px' }}>
                                        <div style={{ fontWeight: 'bold' }}>{room.title}</div>
                                        <div style={{ fontSize: '0.9em', color: '#666' }}>{room.service} (Kind {room.kind})</div>
                                        <div style={{ fontSize: '0.8em', marginBottom: '5px' }}>{room.id.slice(0, 8)}...</div>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <button
                                                onClick={() => handleJoinRoom(room)}
                                                style={{ flex: 1, padding: '5px', fontSize: '0.9em', cursor: 'pointer' }}
                                            >
                                                Join
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleKillRoom(room); }}
                                                style={{ flex: 1, padding: '5px', fontSize: '0.8em', cursor: 'pointer', background: '#cc0000', color: 'white', border: 'none', fontWeight: 'bold' }}
                                                title="Delete event permanently"
                                            >
                                                ☠️ Hard Kill
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {loading && rooms.length === 0 ? (
                        <div className="audio-rooms-loading">
                            <div className="audio-rooms-spinner"></div>
                            <p>Finding audio rooms...</p>
                        </div>
                    ) : (
                        <>
                            {liveRooms.length > 0 && (
                                <>
                                    <h3 className="audio-rooms-subheader">🔴 Live Now</h3>
                                    <div className="audio-rooms-grid">
                                        {liveRooms.map((room) => (
                                            <div
                                                key={room.id}
                                                className="audio-room-card live"
                                                onClick={() => handleJoinRoom(room)}
                                            >
                                                <div className="room-image-container">
                                                    {room.image ? (
                                                        <img src={room.image} alt={room.title} loading="lazy" />
                                                    ) : (
                                                        <div className="room-image-placeholder">🎙️</div>
                                                    )}
                                                    <span className="room-status-badge live">LIVE</span>
                                                </div>
                                                <div className="room-info">
                                                    <div className="room-title">{room.title}</div>
                                                    {room.summary && (
                                                        <div className="room-summary">{room.summary}</div>
                                                    )}
                                                    <div className="room-meta">
                                                        <span className="room-host">
                                                            Host: {room.hostName || room.pubkey.slice(0, 8)}
                                                        </span>
                                                        <span className="room-service">{room.service}</span>
                                                    </div>
                                                    {room.participants > 0 && (
                                                        <div className="room-participants">
                                                            👥 {room.participants} participants
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {recentRooms.length > 0 && (
                                <>
                                    <h3 className="audio-rooms-subheader">Recent Rooms</h3>
                                    <div className="audio-rooms-grid">
                                        {recentRooms.slice(0, 12).map((room) => (
                                            <div
                                                key={room.id}
                                                className="audio-room-card"
                                                onClick={() => handleJoinRoom(room)}
                                            >
                                                <div className="room-image-container">
                                                    {room.image ? (
                                                        <img src={room.image} alt={room.title} loading="lazy" />
                                                    ) : (
                                                        <div className="room-image-placeholder">🎙️</div>
                                                    )}
                                                    <span className="room-status-badge">{room.status}</span>
                                                </div>
                                                <div className="room-info">
                                                    <div className="room-title">{room.title}</div>
                                                    <div className="room-meta">
                                                        <span className="room-host">
                                                            {room.hostName || room.pubkey.slice(0, 8)}
                                                        </span>
                                                        <span className="room-service">{room.service}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {audioRooms.length === 0 && !loading && (
                                <div className="audio-rooms-empty">
                                    <p>No audio rooms found.</p>
                                    <p style={{ fontSize: '9pt', color: '#888' }}>
                                        Check out{' '}
                                        <a href="https://cornychat.com" target="_blank" rel="noopener noreferrer">
                                            Corny Chat
                                        </a>{' '}
                                        or{' '}
                                        <a href="https://nostrnests.com" target="_blank" rel="noopener noreferrer">
                                            Nostr Nests
                                        </a>{' '}
                                        to join or create a room!
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {showCreateModal && (
                <div className="create-room-modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="create-room-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Create Room</h3>
                            <button className="close-button" onClick={() => setShowCreateModal(false)}>&times;</button>
                        </div>

                        <div className="create-room-modal-content">
                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '0.9em', fontWeight: 'bold' }}>Service</label>
                                <select
                                    value={newRoomService}
                                    onChange={(e) => setNewRoomService(e.target.value as 'nests' | 'hivetalk')}
                                    style={{ width: '100%', padding: '5px' }}
                                >
                                    <option value="nests">Nostr Nests (Audio Only)</option>
                                    <option value="hivetalk">HiveTalk (Video + Audio)</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '0.9em', fontWeight: 'bold' }}>Room Title *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Chill Lo-Fi Beats"
                                    value={newRoomTitle}
                                    onChange={(e) => setNewRoomTitle(e.target.value)}
                                    style={{ width: '100%', padding: '5px' }}
                                />
                            </div>

                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '0.9em', fontWeight: 'bold' }}>Description</label>
                                <textarea
                                    placeholder="What's this room about?"
                                    value={newRoomSummary}
                                    onChange={(e) => setNewRoomSummary(e.target.value)}
                                    style={{ width: '100%', padding: '5px', height: '60px' }}
                                />
                            </div>



                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '0.9em', fontWeight: 'bold' }}>Cover Image URL</label>
                                <input
                                    type="text"
                                    placeholder="https://..."
                                    value={newRoomImage}
                                    onChange={(e) => setNewRoomImage(e.target.value)}
                                    style={{ width: '100%', padding: '5px' }}
                                />
                            </div>

                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '0.9em', fontWeight: 'bold' }}>Hashtags (comma separated)</label>
                                <input
                                    type="text"
                                    placeholder="music, chill, tech"
                                    value={newRoomTags}
                                    onChange={(e) => setNewRoomTags(e.target.value)}
                                    style={{ width: '100%', padding: '5px' }}
                                />
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', fontSize: '0.9em', fontWeight: 'bold' }}>Status</label>
                                <select
                                    value={newRoomStatus}
                                    onChange={(e) => setNewRoomStatus(e.target.value as 'live' | 'planned')}
                                    style={{ width: '100%', padding: '5px', marginBottom: '5px' }}
                                >
                                    <option value="live">Live Now</option>
                                    <option value="planned">Scheduled</option>
                                </select>

                                {newRoomStatus === 'planned' && (
                                    <input
                                        type="datetime-local"
                                        value={newRoomStarts}
                                        onChange={(e) => setNewRoomStarts(e.target.value)}
                                        style={{ width: '100%', padding: '5px' }}
                                    />
                                )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button onClick={() => setShowCreateModal(false)} className="cancel-button">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateRoom}
                                    disabled={isCreating}
                                    className="publish-button"
                                    style={{ opacity: isCreating ? 0.7 : 1 }}
                                >
                                    {isCreating ? 'Creating...' : 'Create & Go Live'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


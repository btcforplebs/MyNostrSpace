import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKKind, NDKRelaySet, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import { SEO } from '../Shared/SEO';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import './VideoRoomsPage.css';

interface VideoRoom {
    id: string;
    pubkey: string;
    dTag: string;
    kind: number;
    title: string;
    summary: string;
    image: string;
    status: string;
    streaming: string;
    service: string;
    participants: number;
    createdAt: number;
}

export const VideoRoomsPage = () => {
    const { ndk, user: loggedInUser, login } = useNostr();
    const navigate = useNavigate();
    const { layoutCss } = useCustomLayout(loggedInUser?.pubkey);

    // Expose emergency kill function to window
    useEffect(() => {
        if (!ndk || !loggedInUser) return;

        (window as any).emergencyKill = async () => {
            console.log('SEARCHING FOR ACTIVE ROOMS TO KILL...');
            const events = await ndk.fetchEvents({
                kinds: [30311 as NDKKind],
                authors: [loggedInUser.pubkey]
            });

            if (events.size === 0) {
                console.log('No rooms found for your pubkey.');
                return;
            }

            console.log(`Found ${events.size} rooms.`);
            for (const event of events) {
                const title = event.getMatchingTags('title')[0]?.[1] || 'Untitled';
                const status = event.getMatchingTags('status')[0]?.[1];
                console.log(`Room: ${title} (id: ${event.id}, status: ${status})`);

                if (window.confirm(`KILL ROOM: "${title}" (${status})?`)) {
                    await event.delete();
                    console.log('Deleted.');
                }
            }
            console.log('Done.');
        };
    }, [ndk, loggedInUser]);

    const [rooms, setRooms] = useState<VideoRoom[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newRoomTitle, setNewRoomTitle] = useState('');
    const [newRoomSummary, setNewRoomSummary] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const roomBufferRef = useRef<VideoRoom[]>([]);
    const isUpdatePendingRef = useRef(false);

    const processBuffer = useCallback(() => {
        if (roomBufferRef.current.length === 0) return;

        setRooms((prev) => {
            const next = [...prev];
            let changed = false;

            for (const room of roomBufferRef.current) {
                const existingIdx = next.findIndex(r => r.id === room.id);
                if (existingIdx >= 0) {
                    if (next[existingIdx].createdAt < room.createdAt) {
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
            return next.sort((a, b) => b.createdAt - a.createdAt);
        });
    }, []);

    useEffect(() => {
        if (!ndk) return;

        let isMounted = true;
        setLoading(true);

        // Subscribe to Kind 30311 events with HiveTalk service
        const filter: NDKFilter = {
            kinds: [30311 as NDKKind],
            limit: 50,
        };

        const sub = ndk.subscribe(filter, { closeOnEose: false });

        sub.on('event', (event: NDKEvent) => {
            if (!isMounted) return;
            handleRoomEvent(event);
        });

        sub.on('eose', () => {
            if (isMounted) {
                setLoading(false);
                processBuffer();
            }
        });

        // Initial timeout
        setTimeout(() => {
            if (isMounted) {
                setLoading(false);
                processBuffer();
            }
        }, 5000);

        return () => {
            isMounted = false;
            sub.stop();
        };
    }, [ndk, processBuffer]);

    const handleRoomEvent = (event: NDKEvent) => {
        const streaming = event.getMatchingTags('streaming')[0]?.[1] || '';
        const service = event.getMatchingTags('service')[0]?.[1] || '';

        // Accept VDO.ninja, HiveTalk, or localhost rooms (for backward compatibility)
        const isVideoRoom = streaming.includes('vdo.ninja') ||
            service.includes('vdo.ninja') ||
            streaming.includes('hivetalk') ||
            service.includes('hivetalk') ||
            streaming.includes('localhost:3010') ||
            service.includes('localhost:3010');

        if (!isVideoRoom) return;

        const dTag = event.getMatchingTags('d')[0]?.[1] || '';
        const title = event.getMatchingTags('title')[0]?.[1] || 'Untitled Video Room';
        const summary = event.getMatchingTags('summary')[0]?.[1] || '';
        const image = event.getMatchingTags('image')[0]?.[1] || '';
        const status = event.getMatchingTags('status')[0]?.[1] || 'live';
        const pTags = event.getMatchingTags('p');

        // Determine service name
        let serviceName = 'Video Room';
        if (streaming.includes('vdo.ninja') || service.includes('vdo.ninja')) {
            serviceName = 'VDO.ninja';
        } else if (streaming.includes('hivetalk') || service.includes('hivetalk')) {
            serviceName = 'HiveTalk';
        }

        const room: VideoRoom = {
            id: event.id,
            pubkey: event.pubkey,
            dTag,
            kind: event.kind || 30311,
            title,
            summary,
            image,
            status,
            streaming,
            service: serviceName,
            participants: pTags.length,
            createdAt: event.created_at || 0,
        };

        roomBufferRef.current.push(room);

        if (!isUpdatePendingRef.current) {
            isUpdatePendingRef.current = true;
            requestAnimationFrame(processBuffer);
        }
    };

    const handleJoinRoom = (room: VideoRoom) => {
        // Always navigate to internal video room page (iframe embed)
        navigate(`/videoroom/${room.pubkey}/${room.dTag}`);
    };

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
            // Generate room ID - use a longer ID for privacy (hard to guess)
            const roomId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

            // Create VDO.ninja URL - simpler, no password prompt
            // Using &scene for better group call experience
            const vdoNinjaUrl = `https://vdo.ninja/?room=${roomId}&scene&label=${encodeURIComponent(newRoomTitle)}`;

            // Viewer URL is the same - VDO.ninja handles roles automatically
            const viewerUrl = vdoNinjaUrl;

            const unixNow = Math.floor(Date.now() / 1000);

            const tags = [
                ['d', roomId],
                ['title', newRoomTitle],
                ['summary', newRoomSummary],
                ['status', 'live'],
                ['starts', unixNow.toString()],
                ['service', 'vdo.ninja'], // Using VDO.ninja peer-to-peer
                ['streaming', vdoNinjaUrl], // Host URL (for broadcasting)
                ['url', viewerUrl], // Viewer URL (for joining)
                ['t', 'video'],
                ['t', 'audio'],
                ['p', loggedInUser.pubkey, '', 'Host']
            ];

            const event = new NDKEvent(ndk);
            event.kind = 30311;
            event.tags = tags;

            const relays = ['wss://relay.damus.io', 'wss://relay.primal.net', ...ndk.pool.connectedRelays().map(r => r.url)];
            await event.publish(NDKRelaySet.fromRelayUrls(relays, ndk));

            console.log('Video room event published:', roomId);

            setShowCreateModal(false);
            setNewRoomTitle('');
            setNewRoomSummary('');

            // Navigate to internal video room page (VDO.ninja embedded as iframe)
            navigate(`/videoroom/${loggedInUser.pubkey}/${roomId}`);
        } catch (e) {
            console.error('Error creating video room:', e);
            alert('Failed to create video room. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleKillRoom = async (room: VideoRoom) => {
        if (!ndk || !loggedInUser) {
            console.error('handleKillRoom: missing requirements', { ndk: !!ndk, loggedInUser: !!loggedInUser });
            alert('Cannot end room: missing required authentication');
            return;
        }

        if (!window.confirm(`End room "${room.title}"?`)) {
            return;
        }

        try {
            // Fetch the room event
            const events = await ndk.fetchEvents({
                kinds: [30311 as NDKKind],
                authors: [room.pubkey],
                '#d': [room.dTag]
            });

            const actualEvent = Array.from(events)[0];
            if (!actualEvent) {
                alert('Room not found. It may have already been ended.');
                return;
            }

            // Create updated event with status='ended' (replaceable event)
            const endEvent = new NDKEvent(ndk);
            endEvent.kind = room.kind;
            endEvent.tags = [
                ...actualEvent.tags.filter(t => t[0] !== 'status'),
                ['status', 'ended']
            ];
            endEvent.content = actualEvent.content;

            // Publish once - NDK handles relay distribution
            await endEvent.publish();

            alert('Room ended!');

            // Remove from local state
            setRooms(prev => prev.filter(r => r.id !== room.id));
        } catch (e) {
            console.error('Failed to end room:', e);
            alert(`Failed to end room: ${e}`);
        }
    };

    const myLiveRooms = rooms.filter(r =>
        loggedInUser &&
        r.pubkey.toLowerCase() === loggedInUser.pubkey.toLowerCase()
    );
    // Removed strict status check for "My Rooms" so user can see/kill even if status is weird

    const liveRooms = rooms.filter(r => r.status === 'live' || r.status === 'open');
    const endedRooms = rooms.filter(r => r.status !== 'live' && r.status !== 'open');

    return (
        <div className="home-page-container video-rooms-container">
            {layoutCss && <style>{layoutCss}</style>}
            <SEO title="Video Rooms" description="Join peer-to-peer video rooms on MyNostrSpace - powered by VDO.ninja with zero server bandwidth." />

            <div className="home-wrapper video-rooms-wrapper">
                <Navbar />
                <div className="home-content video-rooms-content">
                    <div className="video-rooms-header-flex">
                        <div>
                            <h2 className="video-rooms-section-header">Video Rooms</h2>
                            <p className="video-rooms-subtitle">
                                Peer-to-peer video calls powered by VDO.ninja - No server bandwidth needed!
                            </p>
                        </div>
                        <button
                            className="myspace-button create-room-btn"
                            onClick={() => loggedInUser ? setShowCreateModal(true) : login()}
                        >
                            + Create Video Room
                        </button>
                    </div>

                    {/* Emergency Stop / My Active Rooms Section */}
                    {loggedInUser && myLiveRooms.length > 0 && (
                        <div className="rooms-section" style={{ background: '#fff0f0', padding: '15px', border: '1px solid #ffcccc', borderRadius: '8px' }}>
                            <h3 style={{ color: '#cc0000', margin: '0 0 10px 0', fontSize: '1.2em' }}>⚠️ My Active Rooms (Emergency Stop)</h3>
                            <div className="rooms-grid">
                                {myLiveRooms.map(room => (
                                    <div key={room.id} className="room-card" style={{ border: '2px solid #cc0000' }}>
                                        <div className="room-card-content">
                                            <h4 style={{ color: '#000' }}>{room.title}</h4>
                                            <p>{room.summary || 'No description'}</p>
                                            <div className="room-card-meta" style={{ marginTop: '10px', gap: '10px' }}>
                                                <button
                                                    onClick={() => handleJoinRoom(room)}
                                                    className="myspace-button"
                                                    style={{ flex: 1, padding: '5px' }}
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
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="video-rooms-loading">Loading video rooms...</div>
                    ) : liveRooms.length === 0 && endedRooms.length === 0 ? (
                        <div className="video-rooms-empty">
                            <p>No video rooms found. Be the first to create one!</p>
                        </div>
                    ) : (
                        <>
                            {liveRooms.length > 0 && (
                                <div className="rooms-section">
                                    <h3 className="rooms-section-title">🔴 Live Now</h3>
                                    <div className="rooms-grid">
                                        {liveRooms.map(room => (
                                            <div key={room.id} className="room-card live" onClick={() => handleJoinRoom(room)}>
                                                <div className="room-card-image">
                                                    {room.image ? (
                                                        <img src={room.image} alt={room.title} />
                                                    ) : (
                                                        <div className="room-card-placeholder">📹</div>
                                                    )}
                                                    <span className="room-status-badge live">LIVE</span>
                                                </div>
                                                <div className="room-card-content">
                                                    <h4>{room.title}</h4>
                                                    <p>{room.summary || 'No description'}</p>
                                                    <div className="room-card-meta">
                                                        <span>👥 {room.participants}</span>
                                                        <span className="room-service">HiveTalk</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {endedRooms.length > 0 && (
                                <div className="rooms-section">
                                    <h3 className="rooms-section-title">📁 Past Rooms</h3>
                                    <div className="rooms-grid">
                                        {endedRooms.slice(0, 6).map(room => (
                                            <div key={room.id} className="room-card ended" onClick={() => handleJoinRoom(room)}>
                                                <div className="room-card-image">
                                                    {room.image ? (
                                                        <img src={room.image} alt={room.title} />
                                                    ) : (
                                                        <div className="room-card-placeholder">📹</div>
                                                    )}
                                                </div>
                                                <div className="room-card-content">
                                                    <h4>{room.title}</h4>
                                                    <p>{room.summary || 'No description'}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <footer className="myspace-footer">
                    © 2003-2026 mynostrspace.com
                </footer>
            </div>

            {
                showCreateModal && (
                    <div className="create-room-modal-overlay" onClick={() => setShowCreateModal(false)}>
                        <div className="create-room-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>Create Video Room</h3>
                                <button className="close-button" onClick={() => setShowCreateModal(false)}>&times;</button>
                            </div>

                            <div className="create-room-modal-content">
                                <div style={{ marginBottom: '10px' }}>
                                    <label style={{ display: 'block', fontSize: '0.9em', fontWeight: 'bold' }}>Room Title *</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Team Standup"
                                        value={newRoomTitle}
                                        onChange={(e) => setNewRoomTitle(e.target.value)}
                                        style={{ width: '100%', padding: '5px' }}
                                    />
                                </div>

                                <div style={{ marginBottom: '10px' }}>
                                    <label style={{ display: 'block', fontSize: '0.9em', fontWeight: 'bold' }}>Description</label>
                                    <textarea
                                        placeholder="What's this video room about?"
                                        value={newRoomSummary}
                                        onChange={(e) => setNewRoomSummary(e.target.value)}
                                        style={{ width: '100%', padding: '5px', height: '60px' }}
                                    />
                                </div>

                                <button
                                    className="myspace-button"
                                    onClick={handleCreateRoom}
                                    disabled={isCreating || !newRoomTitle}
                                    style={{ width: '100%', marginTop: '10px' }}
                                >
                                    {isCreating ? 'Creating...' : '🎥 Create & Join Video Room'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

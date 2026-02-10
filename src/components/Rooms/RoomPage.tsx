import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKKind, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import './RoomPage.css';
import '../Games/GamesPage.css'; // Re-use game player styles

const CONNECTION_TIMEOUT = 10000;

export const RoomPage = () => {
    const { pubkey, identifier } = useParams();
    const dTag = identifier;
    const { ndk, isLoading, user } = useNostr();
    const [roomEvent, setRoomEvent] = useState<NDKEvent | null>(null);
    const roomEventRef = useRef<NDKEvent | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<string>('Initializing...');
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // NIP-07 Proxy Implementation
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            // Security check: ensure message is from the iframe
            if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;

            const { type, id, payload } = event.data;

            // Only handle NIP-07 proxy messages
            if (!type || !type.startsWith('nip07')) return;

            if (!window.nostr) {
                iframeRef.current.contentWindow?.postMessage({ id, error: 'Nostr extension not found' }, '*');
                return;
            }

            try {
                let result;
                switch (type) {
                    case 'nip07.getPublicKey':
                        result = await window.nostr.getPublicKey();
                        break;
                    case 'nip07.signEvent':
                        result = await window.nostr.signEvent(payload);
                        break;
                    case 'nip07.getRelays':
                        if (window.nostr.getRelays) {
                            result = await window.nostr.getRelays();
                        } else {
                            throw new Error('getRelays not supported');
                        }
                        break;
                    case 'nip07.nip04.encrypt':
                        if (window.nostr.nip04?.encrypt) {
                            result = await window.nostr.nip04.encrypt(payload.pubkey, payload.plaintext);
                        } else {
                            throw new Error('nip04.encrypt not supported');
                        }
                        break;
                    case 'nip07.nip04.decrypt':
                        if (window.nostr.nip04?.decrypt) {
                            result = await window.nostr.nip04.decrypt(payload.pubkey, payload.ciphertext);
                        } else {
                            throw new Error('nip04.decrypt not supported');
                        }
                        break;
                    default:
                        throw new Error(`Unknown method: ${type}`);
                }

                iframeRef.current.contentWindow?.postMessage({ id, result }, '*');
            } catch (err: any) {
                iframeRef.current.contentWindow?.postMessage({ id, error: err.message || 'Unknown error' }, '*');
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Fetch room event from relays to get metadata
    useEffect(() => {
        if (isLoading || !ndk || !pubkey || !dTag) return;

        let isMounted = true;

        const fetchData = async () => {
            const cleanPubkey = pubkey.toLowerCase();
            const cleanDTag = dTag.toLowerCase();

            setConnectionStatus('Loading Room...');

            const roomFilter: NDKFilter[] = [
                { kinds: [30311 as NDKKind, 30312 as NDKKind], authors: [cleanPubkey], '#d': [cleanDTag] },
                { kinds: [30311 as NDKKind, 30312 as NDKKind], '#p': [cleanPubkey], '#d': [cleanDTag] },
            ];

            const sub = ndk.subscribe(roomFilter, { closeOnEose: false });

            sub.on('event', (e) => {
                if (isMounted) {
                    setRoomEvent(e);
                    roomEventRef.current = e;
                    setConnectionStatus('Room found.');
                }
                sub.stop();
            });

            setTimeout(() => {
                if (isMounted && !roomEventRef.current) {
                    setConnectionStatus('Room not found on connected relays.');
                }
                sub.stop();
            }, CONNECTION_TIMEOUT);
        };

        fetchData();

        return () => {
            isMounted = false;
        };
    }, [ndk, pubkey, dTag, isLoading]);

    if (!roomEvent) {
        return (
            <div className="home-page-container audio-room-page-container">
                <Navbar />
                <div className="loading-content" style={{ padding: '20px', textAlign: 'center', color: 'white' }}>
                    <p>{connectionStatus}</p>
                    <Link to="/rooms" style={{ color: 'var(--myspace-blue)' }}>&larr; Back to Rooms</Link>
                </div>
            </div>
        );
    }

    const roomId = roomEvent.getMatchingTags('d')[0]?.[1] || dTag;
    const title = roomEvent.getMatchingTags('title')[0]?.[1] || 'Untitled Room';

    // Construct NostrNests URL
    // Default to the known NostrNests URL structure
    let appUrl = `https://nostrnests.com/room/${roomId}`;

    // Append pubkey if user is logged in
    if (user?.pubkey) {
        appUrl = `${appUrl}?pubkey=${user.pubkey}`;
    }

    return (
        <div className="game-player-container">
            <div className="games-header-area">
                <Navbar />
            </div>

            <div className="player-controls-bar">
                <div className="player-controls-left">
                    <Link to="/rooms" className="player-breadcrumbs-link">
                        ← Rooms
                    </Link>
                    <span className="player-breadcrumbs-separator">|</span>
                    <span className="player-app-title">{title}</span>
                </div>

                <a
                    href={appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="external-link-button"
                    style={{
                        fontSize: '0.8rem',
                        padding: '6px 12px',
                        background: '#333',
                        borderRadius: '4px',
                        color: '#fff',
                        textDecoration: 'none'
                    }}
                >
                    Open in New Tab ↗
                </a>
            </div>

            {/* Warning Banner */}
            <div className="player-warning-banner">
                ⚠️ To log in, you must use a remote signer (like proper Nostr extension) or visit the page directly.
            </div>

            <div className="game-frame-wrapper">
                <iframe
                    ref={iframeRef}
                    src={appUrl}
                    className="game-iframe"
                    title={title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; microphone"
                    allowFullScreen
                ></iframe>
            </div>
        </div>
    );
};

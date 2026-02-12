import { useParams, Link } from 'react-router-dom';
import { GAMES_LIST } from './gamesData';
import { useNostr } from '../../context/NostrContext';
import { Navbar } from '../Shared/Navbar';
import { useEffect, useRef } from 'react';
import './GamesPage.css';

export const GamePlayerPage = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const game = GAMES_LIST.find((g) => g.id === gameId);
  const { user } = useNostr();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // NIP-07 Proxy Implementation
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Security check: ensure message is from the game frame
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;

      const { type, id, payload } = event.data;

      // Only handle NIP-07 proxy messages
      if (!type || !type.startsWith('nip07')) return;

      if (!window.nostr) {
        iframeRef.current.contentWindow?.postMessage(
          { id, error: 'Nostr extension not found' },
          '*'
        );
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
        iframeRef.current.contentWindow?.postMessage(
          { id, error: err.message || 'Unknown error' },
          '*'
        );
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [game]);

  if (!game) {
    return (
      <div className="games-page-container">
        <Navbar />
        <div className="not-found-container">
          <h1>Game not found</h1>
          <Link to="/games">Back to Arcade</Link>
        </div>
      </div>
    );
  }

  // Append pubkey if user is logged in
  let gameUrl = game.url;
  if (user?.pubkey) {
    const separator = gameUrl.includes('?') ? '&' : '?';
    // Use 'pubkey' as a common standard, some apps might use 'npub'
    gameUrl = `${gameUrl}${separator}pubkey=${user.pubkey}`;
  }

  return (
    <div className="game-player-container">
      <div className="games-header-area">
        <Navbar />
      </div>

      <div className="player-controls-bar">
        <div className="player-controls-left">
          <Link to="/games" className="player-breadcrumbs-link">
            ← Arcade
          </Link>
          <span className="player-breadcrumbs-separator">|</span>
          <span className="player-app-title">{game.title}</span>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <a
            href={game.url}
            target="_blank"
            rel="noopener noreferrer"
            className="external-link-button"
            style={{
              fontSize: '0.8rem',
              padding: '6px 12px',
              background: '#333',
              borderRadius: '4px',
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            Open in New Tab ↗
          </a>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="player-warning-banner">
        ⚠️ To log in, you must use a remote signer or visit the page directly.
      </div>

      <div className="game-frame-wrapper">
        <iframe
          ref={iframeRef}
          src={gameUrl}
          className="game-iframe"
          title={game.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; payment; fullscreen"
          allowFullScreen
        ></iframe>
      </div>
    </div>
  );
};

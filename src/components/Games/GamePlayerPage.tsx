import { useParams, Link } from 'react-router-dom';
import { GAMES_LIST } from './gamesData';
import { useNostr } from '../../context/NostrContext';
import { Navbar } from '../Shared/Navbar';
import { useRef } from 'react';
import { useNip07Proxy } from '../../hooks/useNip07Proxy';
import './GamesPage.css';

export const GamePlayerPage = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const game = GAMES_LIST.find((g) => g.id === gameId);
  const { user } = useNostr();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Bridge the game iframe to the user's NIP-07 extension (origin-validated).
  useNip07Proxy(iframeRef, game?.url);

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

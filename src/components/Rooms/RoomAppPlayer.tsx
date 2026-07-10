import { useParams, Link } from 'react-router-dom';
import { ROOM_APPS } from './RoomsPage';
import { useNostr } from '../../context/NostrContext';
import { Navbar } from '../Shared/Navbar';
import { useRef } from 'react';
import { useNip07Proxy } from '../../hooks/useNip07Proxy';
import '../Games/GamesPage.css';

export const RoomAppPlayer = () => {
  const { appId } = useParams<{ appId: string }>();
  const app = ROOM_APPS.find((a) => a.id === appId);
  const { user } = useNostr();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Bridge the app iframe to the user's NIP-07 extension (origin-validated).
  useNip07Proxy(iframeRef, app?.url);

  if (!app) {
    return (
      <div className="games-page-container">
        <Navbar />
        <div className="not-found-container">
          <h1>App not found</h1>
          <Link to="/rooms">Back to Rooms</Link>
        </div>
      </div>
    );
  }

  // Append pubkey if user is logged in
  let appUrl = app.url;
  if (user?.pubkey) {
    const separator = appUrl.includes('?') ? '&' : '?';
    appUrl = `${appUrl}${separator}pubkey=${user.pubkey}`;
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
          <span className="player-app-title">{app.title}</span>
        </div>

        <a
          href={app.url}
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

      {/* Warning Banner */}
      <div className="player-warning-banner">
        ⚠️ To log in, you must use a remote signer or visit the page directly.
      </div>

      <div className="game-frame-wrapper">
        <iframe
          ref={iframeRef}
          src={appUrl}
          className="game-iframe"
          title={app.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; microphone"
          allowFullScreen
        ></iframe>
      </div>
    </div>
  );
};

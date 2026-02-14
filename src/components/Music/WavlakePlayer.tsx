import { useState, useRef, useEffect } from 'react';
import './WavlakePlayer.css';

interface WavlakeTrack {
  title: string;
  url: string;
  link?: string;
  albumArtUrl?: string; // Added for art support
  // We might parse more from the URL if needed, but for now we trust the stored data
}

interface WavlakePlayerProps {
  trackUrl?: string; // Legacy single track or raw URL
  tracks?: WavlakeTrack[]; // New Playlist support
  trackId?: string; // Legacy ID (unused mostly now)
  hideHeader?: boolean;
  autoplay?: boolean;
  // Controlled props
  currentTrackIndex?: number;
  onTrackSelect?: (index: number) => void;
  hidePlaylist?: boolean;
  playlistTitle?: string; // Custom title for playlist section
}

export const WavlakePlayer = ({
  trackUrl,
  tracks,
  hideHeader,
  autoplay = false,
  currentTrackIndex: controlledIndex,
  onTrackSelect,
  hidePlaylist = false,
  playlistTitle,
}: WavlakePlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // State for the "current" track when in playlist mode
  const [internalCurrentIndex, setInternalCurrentIndex] = useState(0);

  // Use controlled index if available, otherwise internal
  const currentIndex = controlledIndex ?? internalCurrentIndex;

  const handleTrackChange = (newIndex: number) => {
    if (onTrackSelect) {
      onTrackSelect(newIndex);
    } else {
      setInternalCurrentIndex(newIndex);
    }
  };

  const visHeights = [45, 72, 33, 90, 55, 82, 40, 68, 25, 88, 50, 75];

  // If a direct URL is provided (from WavlakeSearch or legacy single track), use a simple iframe
  // But if we have a playlist (tracks array), we want to show the full player UI
  const activePlaylist = tracks && tracks.length > 0 ? tracks : null;

  // Derived state for the currently playing track data
  const currentTrackData = activePlaylist ? activePlaylist[currentIndex] : null;

  // Determine the source URL
  let playbackUrl = currentTrackData ? currentTrackData.url : trackUrl;

  // "Magic Upgrade": If it's a legacy Embed URL, convert it to a direct MP3 to enable the Retro Player
  if (playbackUrl?.includes('embed.wavlake.com')) {
    const match = playbackUrl.match(/\/track\/([a-f0-9-]+)/);
    if (match && match[1]) {
      const trackId = match[1];
      // Known Wavlake Cloudfront pattern as of Jan 2026
      playbackUrl = `https://d12wklypp119aj.cloudfront.net/track/${trackId}.mp3`;
    }
  }

  // Check if it's a Wavlake URL and ensure it uses the embed domain if we're iframeing it
  const isLegacyEmbed =
    playbackUrl?.includes('wavlake.com/embed') || playbackUrl?.includes('embed.wavlake.com');

  if (isLegacyEmbed && playbackUrl && !playbackUrl.includes('embed.wavlake.com')) {
    playbackUrl = playbackUrl.replace('www.wavlake.com/embed', 'embed.wavlake.com');
  }

  // Explicitly handle autoplay when the playbackUrl or autoplay prop changes
  useEffect(() => {
    if (autoplay && audioRef.current) {
      audioRef.current.play().catch((err) => {
        console.warn('Autoplay blocked or failed:', err);
      });
      setIsPlaying(true);
    }
  }, [playbackUrl, autoplay]);

  return (
    <div className="wavlake-player">
      {!hideHeader && (
        <div
          className="section-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>Music Player</span>
          <span className="powered-by-wavlake" style={{ fontSize: '7pt', fontWeight: 'normal' }}>
            powered by{' '}
            <a
              href="https://wavlake.com"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#003399', textDecoration: 'none', fontWeight: 'bold' }}
            >
              wavlake
            </a>
          </span>
        </div>
      )}

      {/* Retro Player Wrapper */}
      <div className="retro-player-box">
        <div className="player-top">
          <div className="player-brand">MyNostrSpace Music</div>
          <div className="player-controls-dots">
            <span>_</span>
            <span>□</span>
            <span>X</span>
          </div>
        </div>

        <div className="player-main-area">
          {isLegacyEmbed ? (
            <iframe
              key={playbackUrl}
              src={
                playbackUrl && !playbackUrl.includes('autoplay=')
                  ? `${playbackUrl}${playbackUrl.includes('?') ? '&' : '?'}autoplay=${autoplay}`
                  : playbackUrl
              }
              width="100%"
              height="180"
              frameBorder="0"
              allow="autoplay; encrypted-media"
              loading="lazy"
              style={{ backgroundColor: '#000' }}
            ></iframe>
          ) : (
            <>
              <div className="player-vis">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="vis-bar" style={{ height: `${visHeights[i]}%` }}></div>
                ))}
              </div>
              <div className="player-display-window">
                <div className="song-info-line marquee-container-classic">
                  <div className="marquee-text-classic">
                    {currentTrackData?.title || trackUrl || 'Unknown Track'}
                  </div>
                </div>
                <div className="track-time-display">{isPlaying ? 'PLAYING' : 'READY'} | 00:00</div>
              </div>
            </>
          )}
        </div>

        {!isLegacyEmbed && (
          <div className="player-ui-controls">
            <div className="player-buttons-row">
              <button
                className="p-btn-legacy"
                onClick={() =>
                  activePlaylist &&
                  handleTrackChange(
                    currentIndex === 0 ? activePlaylist.length - 1 : currentIndex - 1
                  )
                }
              >
                ⏴⏴
              </button>
              <button
                className={`p-btn-legacy ${isPlaying ? 'active' : ''}`}
                onClick={() => {
                  audioRef.current?.play();
                  setIsPlaying(true);
                }}
              >
                ▶
              </button>
              <button
                className="p-btn-legacy"
                onClick={() => {
                  audioRef.current?.pause();
                  setIsPlaying(false);
                }}
              >
                ⏸
              </button>
              <button
                className="p-btn-legacy"
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = 0;
                    setIsPlaying(false);
                  }
                }}
              >
                ⏹
              </button>
              <button
                className="p-btn-legacy"
                onClick={() =>
                  activePlaylist && handleTrackChange((currentIndex + 1) % activePlaylist.length)
                }
              >
                ⏵⏵
              </button>
            </div>
            {/* Playlist Controls (Only if multiple tracks) */}
            {activePlaylist && activePlaylist.length > 1 && (
              <div
                className="playlist-controls"
                style={{
                  marginTop: '10px',
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                <button
                  onClick={() =>
                    handleTrackChange(
                      currentIndex === 0 ? activePlaylist.length - 1 : currentIndex - 1
                    )
                  }
                  style={{ fontSize: '9pt', fontWeight: 'bold' }}
                >
                  |&lt; Prev
                </button>
                <span style={{ fontSize: '9pt', lineHeight: '25px' }}>
                  {currentIndex + 1} / {activePlaylist.length}
                </span>
                <button
                  onClick={() => handleTrackChange((currentIndex + 1) % activePlaylist.length)}
                  style={{ fontSize: '9pt', fontWeight: 'bold' }}
                >
                  Next &gt;|
                </button>
              </div>
            )}
            <audio
              ref={audioRef}
              key={playbackUrl}
              src={playbackUrl}
              autoPlay={autoplay}
              style={{ width: '100%', height: '24px', filter: 'invert(1) hue-rotate(180deg)' }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                if (activePlaylist && activePlaylist.length > 1) {
                  handleTrackChange((currentIndex + 1) % activePlaylist.length);
                } else {
                  setIsPlaying(false);
                }
              }}
            />
          </div>
        )}

        <a
          href={currentTrackData?.link || 'https://wavlake.com'}
          target="_blank"
          rel="noreferrer"
          className="wavlake-link-under"
        >
          {currentTrackData?.link ? 'View on Wavlake' : 'Powered by wavlake.com'}
        </a>
      </div>

      {/* Playlist Table - Conditionally rendered */}
      {activePlaylist && !hidePlaylist && (
        <div className="playlist-container" style={{ marginTop: '5px', fontSize: '8pt' }}>
          <table className="myspace-table" style={{ width: '100%', marginBottom: 0 }}>
            {playlistTitle && (
              <thead>
                <tr>
                  <th style={{ background: 'var(--myspace-blue)', color: 'white' }}>
                    {playlistTitle}
                  </th>
                </tr>
              </thead>
            )}
            <tbody>
              {activePlaylist.map((track, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#f9f9f9' : '#ffffff' }}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {track.albumArtUrl && (
                      <img
                        src={track.albumArtUrl}
                        alt="art"
                        style={{ width: '25px', height: '25px', objectFit: 'cover' }}
                      />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <span
                        onClick={() => handleTrackChange(i)}
                        style={{
                          cursor: 'pointer',
                          fontWeight: currentIndex === i ? 'bold' : 'normal',
                          color: currentIndex === i ? 'red' : 'blue',
                          textDecoration: 'underline',
                        }}
                      >
                        {track.title}
                      </span>
                      {track.link && (
                        <a
                          href={track.link}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: '7pt',
                            color: '#666',
                            textDecoration: 'none',
                            marginLeft: '5px',
                          }}
                        >
                          [view on wavlake]
                        </a>
                      )}
                    </div>
                    {currentIndex === i && (
                      <span style={{ color: 'red', fontSize: '8px' }}>♫ Playing</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

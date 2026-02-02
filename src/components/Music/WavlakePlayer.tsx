import { useState } from 'react';
import './WavlakePlayer.css';

interface WavlakeTrack {
  title: string;
  url: string;
  link?: string;
  // We might parse more from the URL if needed, but for now we trust the stored data
}

interface WavlakePlayerProps {
  trackUrl?: string; // Legacy single track or raw URL
  tracks?: WavlakeTrack[]; // New Playlist support
  trackId?: string; // Legacy ID (unused mostly now)
}

export const WavlakePlayer = ({ trackUrl, tracks }: WavlakePlayerProps) => {
  // State for the "current" track when in playlist mode
  const [currentIndex, setCurrentIndex] = useState(0);

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

  // Check if it's STILL a legacy Embed URL (failed to convert?)
  const isLegacyEmbed = playbackUrl?.includes('embed.wavlake.com');

  // Wavlake Logo (SVG or Image URL)
  const wavlakeLogo = 'https://wavlake.com/favicon.ico'; // Simple icon for now

  return (
    <div className="wavlake-player">
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

      {/* Player Area */}
      <div
        className="retro-player-box"
        style={{
          background: '#f5f5f5',
          border: '1px solid #ccc',
          padding: '10px',
          textAlign: 'center',
        }}
      >
        <div style={{ background: '#000', padding: '5px', borderRadius: '12px' }}>
          {isLegacyEmbed ? (
            <iframe
              key={playbackUrl}
              style={{ borderRadius: '12px' }}
              src={
                playbackUrl && !playbackUrl.includes('autoplay=true')
                  ? `${playbackUrl}${playbackUrl.includes('?') ? '&' : '?'}autoplay=true`
                  : playbackUrl
              }
              width="100%"
              height="380"
              frameBorder="0"
              allowFullScreen
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            ></iframe>
          ) : (
            <div style={{ color: 'white', padding: '20px' }}>
              {/* Custom Retro Player UI */}
              <div style={{ marginBottom: '15px' }}>
                <div style={{ fontSize: '10pt', fontWeight: 'bold', color: '#00ff00' }}>
                  NOW PLAYING
                </div>
                <div style={{ fontSize: '12pt', margin: '5px 0' }}>
                  {currentTrackData?.title || 'Unknown Track'}
                </div>
                {/* Link to Wavlake Artist/Track Page */}
                {currentTrackData?.link && (
                  <a
                    href={currentTrackData.link}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      color: '#aaa',
                      textDecoration: 'none',
                      fontSize: '8pt',
                    }}
                  >
                    <img
                      src={wavlakeLogo}
                      alt="Wavlake"
                      style={{ width: '12px', height: '12px', marginRight: '4px' }}
                    />
                    View on Wavlake
                  </a>
                )}
              </div>

              <audio
                key={playbackUrl}
                src={playbackUrl}
                controls
                autoPlay
                style={{ width: '100%', height: '30px' }}
                onEnded={() => {
                  if (activePlaylist && activePlaylist.length > 1) {
                    setCurrentIndex((prev) => (prev + 1) % activePlaylist.length);
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* Playlist Controls (Only if multiple tracks) */}
        {activePlaylist && activePlaylist.length > 1 && (
          <div
            className="playlist-controls"
            style={{ marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '10px' }}
          >
            <button
              onClick={() =>
                setCurrentIndex((prev) => (prev === 0 ? activePlaylist.length - 1 : prev - 1))
              }
              style={{ fontSize: '9pt', fontWeight: 'bold' }}
            >
              |&lt; Prev
            </button>
            <span style={{ fontSize: '9pt', lineHeight: '25px' }}>
              {currentIndex + 1} / {activePlaylist.length}
            </span>
            <button
              onClick={() => setCurrentIndex((prev) => (prev + 1) % activePlaylist.length)}
              style={{ fontSize: '9pt', fontWeight: 'bold' }}
            >
              Next &gt;|
            </button>
          </div>
        )}
      </div>

      {/* Playlist Table */}
      {activePlaylist && (
        <div className="playlist-container" style={{ marginTop: '5px', fontSize: '8pt' }}>
          <table className="myspace-table" style={{ width: '100%', marginBottom: 0 }}>
            <thead>
              <tr>
                <th style={{ background: '#ffcc99' }}>Profile Playlist</th>
              </tr>
            </thead>
            <tbody>
              {activePlaylist.map((track, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#ffcc99' : '#ffffff' }}>
                  <td style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span
                        onClick={() => setCurrentIndex(i)}
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

import { useEffect, useState } from 'react';
import { Navbar } from '../Shared/Navbar';
import { WavlakePlayer } from './WavlakePlayer';
import './MusicPage.css';

interface WavlakeTrack {
  id: string;
  title: string;
  artist: string;
  albumArtUrl: string;
  url: string; // Link to Wavlake page
}

export const MusicPage = () => {
  const [tracks, setTracks] = useState<WavlakeTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [shouldAutoplay, setShouldAutoplay] = useState(false);

  const handleTrackSelect = (index: number) => {
    setCurrentTrackIndex(index);
    setShouldAutoplay(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const fetchMusic = async () => {
      try {
        const res = await fetch('https://wavlake.com/api/v1/content/rankings?sort=sats&days=7');
        const data = await res.json();

        if (Array.isArray(data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formatted = data.map((item: any) => ({
            id: item.id,
            title: item.title,
            artist: item.artist,
            albumArtUrl: item.albumArtUrl,
            // Construct Embed URL so WavlakePlayer can do its magic upgrade to MP3
            // Original URL: https://wavlake.com/track/UUID
            // Embed URL: https://embed.wavlake.com/track/UUID
            url: `https://embed.wavlake.com/track/${item.id}`,
            link: item.url, // Keep original link for "View on Wavlake"
          }));
          setTracks(formatted);
        }
      } catch (err) {
        console.error('Failed to fetch Wavlake music', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMusic();
  }, []);

  return (
    <div className="music-page-container">
      <div
        className="music-header-area"
        style={{ maxWidth: '992px', margin: '0 auto', width: '100%' }}
      >
        <Navbar />
      </div>

      <div className="music-content">
        <h2 className="section-header">Top Music on Wavlake (Last 7 Days)</h2>

        {!loading && tracks.length > 0 && (
          <div className="sticky-player-container">
            <WavlakePlayer
              tracks={tracks}
              currentTrackIndex={currentTrackIndex}
              onTrackSelect={setCurrentTrackIndex}
              hidePlaylist={true}
              autoplay={shouldAutoplay}
            />
          </div>
        )}

        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading top tracks...</div>
        ) : (
          <div className="music-grid">
            {tracks.map((track, index) => (
              <div
                key={track.id}
                className={`music-card ${currentTrackIndex === index ? 'active-track' : ''}`}
                onClick={() => handleTrackSelect(index)}
              >
                <div className="album-art-wrapper">
                  <img
                    src={
                      track.albumArtUrl ||
                      `https://robohash.org/${track.id}.png?set=set4&bgset=bg2&size=150x150`
                    }
                    alt={`${track.title} Album Art`}
                    className="album-art"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        `https://robohash.org/${track.id}.png?set=set4&bgset=bg2&size=150x150`;
                    }}
                  />
                </div>
                <div className="track-info">
                  <a
                    href={track.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="track-title"
                    title={track.title}
                  >
                    {track.title}
                  </a>

                  <span className="track-artist" title={track.artist}>
                    {track.artist}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && tracks.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            No tracks found right now. Check back later!
          </div>
        )}
      </div>
    </div>
  );
};

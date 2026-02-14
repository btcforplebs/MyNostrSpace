import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../Shared/Navbar';
import { WavlakePlayer } from './WavlakePlayer';
import './MusicPage.css';

interface WavlakeTrack {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  albumArtUrl: string;
  url: string; // Link to Player (Embed URL)
  link?: string; // Link to Wavlake page (optional)
}

export const MusicPage = () => {
  const [tracks, setTracks] = useState<WavlakeTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [shouldAutoplay, setShouldAutoplay] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleTrackSelect = (index: number) => {
    setCurrentTrackIndex(index);
    setShouldAutoplay(true);
    // window.scrollTo({ top: 0, behavior: 'smooth' }); // Optional: don't scroll on mobile list view?
  };

  const fetchMusic = async (term: string = '') => {
    setLoading(true);
    setIsSearching(!!term);
    try {
      let url = 'https://wavlake.com/api/v1/content/rankings?sort=sats&days=7';
      if (term) {
        url = `https://wavlake.com/api/v1/content/search?term=${encodeURIComponent(term)}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        console.error('Wavlake API returned', res.status, res.statusText);
        setLoading(false);
        return;
      }

      const data = await res.json();

      let formatted: WavlakeTrack[] = [];

      if (term) {
        // Search returns a mixed array, filter for favorites or tracks/albums?
        // Let's just show tracks for now to keep it simple for the player
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatted = data
          .filter((item: any) => item.type === 'track')
          .map((item: any) => ({
            id: item.id,
            title: item.title,
            artist: item.artist,
            artistId: item.artistId,
            albumArtUrl: item.albumArtUrl,
            url: `https://embed.wavlake.com/track/${item.id}`,
            link: `https://wavlake.com/track/${item.id}`,
          }));
      } else {
        if (Array.isArray(data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatted = data.map((item: any) => ({
            id: item.id,
            title: item.title,
            artist: item.artist,
            artistId: item.artistId,
            albumArtUrl: item.albumArtUrl,
            url: `https://embed.wavlake.com/track/${item.id}`,
            link: item.url,
          }));
        }
      }

      setTracks(formatted);
    } catch (err) {
      console.error('Failed to fetch Wavlake music', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMusic();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMusic(searchTerm);
  };

  return (
    <div className="home-page-container mp-page-container">
      <div className="home-wrapper mp-wrapper">
        <Navbar />

        <div className="home-content mp-content">
          <div className="mp-header-controls">
            <h2 className="mp-section-header">
              {isSearching ? `Search Results: "${searchTerm}"` : 'Top Music on Wavlake (Last 7 Days)'}
            </h2>
            <form onSubmit={handleSearchSubmit} className="mp-search-form">
              <input
                type="text"
                className="mp-search-input"
                placeholder="Search songs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button type="submit" className="mp-search-btn">
                Search
              </button>
            </form>
          </div>

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
            <div style={{ padding: '20px', textAlign: 'center' }}>
              {isSearching ? 'Searching Wavlake...' : 'Loading top tracks...'}
            </div>
          ) : (
            <div className="music-grid">
              {tracks.map((track: WavlakeTrack, index: number) => (
                <div
                  key={track.id}
                  className={`music-card ${currentTrackIndex === index ? 'active-track' : ''}`}
                  onClick={(e) => {
                    // Prevent playback if clicking a link
                    if ((e.target as HTMLElement).tagName === 'A') return;
                    handleTrackSelect(index);
                  }}
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
                        (e.target as HTMLImageElement).src = `https://robohash.org/${track.id}.png?set=set4&bgset=bg2&size=150x150`;
                      }}
                    />
                    {/* Overlay still works for desktop hover */}
                    <div className="card-overlay" onClick={(e) => {
                      e.stopPropagation(); // Prevent double trigger
                      handleTrackSelect(index);
                    }}>
                      <button className="play-overlay-btn">Play</button>
                    </div>
                  </div>
                  <div className="track-info">
                    <Link
                      to={`/music/track/${track.id}`}
                      className="track-title"
                      title={track.title}
                    >
                      {track.title}
                    </Link>

                    <Link
                      to={`/music/artist/${track.artistId}`}
                      className="track-artist-link"
                      title={track.artist}
                    >
                      {track.artist}
                    </Link>

                    <div className="card-actions">
                      {/* Removed View Button - Title is the link now */}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && tracks.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              No tracks found. Try a different search!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

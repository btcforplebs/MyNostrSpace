import { useState } from 'react';

interface WavlakeTrack {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  mediaUrl: string;
}

interface WavlakeSearchProps {
  onSelect: (track: { title: string; url: string; link?: string }) => void;
}

interface WavlakeRawTrack {
  id: string;
  type?: string;
  title: string;
  artist?: string;
  artworkUrl?: string;
  albumArtUrl?: string;
  mediaUrl: string;
  slug?: string;
}

export const WavlakeSearch = ({ onSelect }: WavlakeSearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WavlakeTrack[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    try {
      // Wavlake API v1 (Assuming standard structure or checking docs)
      const res = await fetch(
        `https://wavlake.com/api/v1/content/search?term=${encodeURIComponent(query)}`
      );
      const data = await res.json();

      // Wavlake API returns an array directly
      const rawData = data.data || data;
      const tracks = Array.isArray(rawData)
        ? (rawData as WavlakeRawTrack[]).filter(
            (item) => item.type === 'track' || (item.title && item.mediaUrl)
          )
        : [];

      const mapped = tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist || 'Unknown',
        artwork: t.artworkUrl || t.albumArtUrl || '',
        mediaUrl: t.mediaUrl,
      }));
      setResults(mapped);
    } catch (e) {
      console.error(e);
      alert('Error searching Wavlake');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wavlake-search">
      <h4>Select a Song (Wavlake)</h4>
      <div style={{ display: 'flex', gap: '5px' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search artist or song..."
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button onClick={handleSearch} disabled={loading}>
          {loading ? '...' : 'Search'}
        </button>
      </div>

      <div
        className="results-list"
        style={{
          marginTop: '10px',
          maxHeight: '200px',
          overflowY: 'auto',
          border: '1px solid #ccc',
        }}
      >
        {results.map((track) => (
          <div
            key={track.id}
            className="track-result"
            onClick={() =>
              onSelect({
                title: `${track.artist} - ${track.title}`,
                url: track.mediaUrl, // DIRECT MP3 for new player
                link: `https://wavlake.com/track/${track.id}`,
              })
            }
          >
            {track.artwork && <img src={track.artwork} alt="art" />}
            <div className="track-info">
              <strong>{track.title}</strong>
              <span>{track.artist}</span>
            </div>
          </div>
        ))}
      </div>

      <style>{`
                .track-result {
                    display: flex;
                    align-items: center;
                    padding: 5px;
                    cursor: pointer;
                    border-bottom: 1px solid #eee;
                }
                .track-result:hover {
                    background: #e5f5ff;
                }
                .track-result img {
                    width: 40px;
                    height: 40px;
                    object-fit: cover;
                    margin-right: 10px;
                }
                .track-info {
                    display: flex;
                    flex-direction: column;
                    font-size: 9pt;
                }
             `}</style>
    </div>
  );
};

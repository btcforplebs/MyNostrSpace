import { useState } from 'react';

interface WavlakeTrack {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  mediaUrl: string;
}

interface WavlakeSearchProps {
  onSelect: (track: { title: string; url: string }) => void;
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
        ? rawData.filter((item: any) => item.type === 'track' || (item.title && item.mediaUrl))
        : [];

      const mapped = tracks.map((t: any) => ({
        id: t.id,
        title: t.title,
        artist: t.artist || 'Unknown',
        artwork: t.artworkUrl || t.albumArtUrl || '',
        mediaUrl: t.mediaUrl,
        slug: t.slug, // Assuming slug exists or we use ID for link
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
                // We attach extra metadata for the player to use if it can,
                // but our interface in EditProfilePage currently only expects title/url to be saved.
                // To actually save the external link, we need to hack it into the 'url' or 'title',
                // OR we assume the player can't link back unless we store more data.
                // Strategy: We will store the Wavlake Link as part of a composite object if possible,
                // but since the schema is {title, url}, we might have to rely on just the MP3.
                // WAIT: The user wants a link to the artist song.
                // I should update ExtendedProfileData schema to allow optional 'link' field?
                // Or just pass it here and let EditProfilePage decide.
                // Let's add 'link' property to the object passed to onSelect.
                // We'll update EditProfilePage to save it.
                // Actually, let's keep it simple: `url` is MP3. We'll add a `link` property to the saved object.
                link: `https://wavlake.com/track/${track.id}`,
              } as any)
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

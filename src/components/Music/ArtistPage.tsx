import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Navbar } from '../Shared/Navbar';
import { WavlakePlayer } from './WavlakePlayer';
import './MusicPage.css';

interface WavlakeTrack {
    id: string;
    title: string;
    artist: string;
    albumArtUrl: string;
    url: string; // Embed URL or media URL
    link: string; // Wavlake page link
}

interface ArtistData {
    id: string;
    name: string;
    bio?: string;
    artistArtUrl?: string;
    artistHeaderUrl?: string;
    tracks: any[];
}

export const ArtistPage = () => {
    const { artistId } = useParams<{ artistId: string }>();
    const [artist, setArtist] = useState<ArtistData | null>(null);
    const [tracks, setTracks] = useState<WavlakeTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
    const [shouldAutoplay, setShouldAutoplay] = useState(false);

    useEffect(() => {
        const fetchArtist = async () => {
            try {
                const res = await fetch(`https://wavlake.com/api/v1/content/artist/${artistId}`);
                if (!res.ok) throw new Error('Failed to fetch artist');
                const data = await res.json();
                setArtist(data);

                let allTracks: WavlakeTrack[] = [];

                // Wavlake Artist API often embeds a few tracks in data.tracks, 
                // but detailed info usually comes through data.albums
                if (data.albums && Array.isArray(data.albums)) {
                    // Fetch full album data for each to get tracks
                    const albumPromises = data.albums.map((album: any) =>
                        fetch(`https://wavlake.com/api/v1/content/album/${album.id}`).then(r => r.json())
                    );

                    const fullAlbums = await Promise.all(albumPromises);
                    fullAlbums.forEach((fullAlbum: any) => {
                        if (fullAlbum.tracks && Array.isArray(fullAlbum.tracks)) {
                            const formatted = fullAlbum.tracks.map((item: any) => ({
                                id: item.id,
                                title: item.title,
                                artist: data.name,
                                albumArtUrl: item.albumArtUrl || fullAlbum.albumArtUrl || data.artistArtUrl,
                                url: `https://embed.wavlake.com/track/${item.id}`,
                                link: item.url || `https://wavlake.com/track/${item.id}`,
                            }));
                            allTracks = [...allTracks, ...formatted];
                        }
                    });
                } else if (data.tracks && Array.isArray(data.tracks)) {
                    // Fallback to top-level tracks if no albums
                    allTracks = data.tracks.map((item: any) => ({
                        id: item.id,
                        title: item.title,
                        artist: data.name,
                        albumArtUrl: item.albumArtUrl || data.artistArtUrl,
                        url: `https://embed.wavlake.com/track/${item.id}`,
                        link: item.url || `https://wavlake.com/track/${item.id}`,
                    }));
                }

                // Deduplicate tracks by ID just in case
                const uniqueTracks = allTracks.filter((track, index, self) =>
                    index === self.findIndex((t) => t.id === track.id)
                );

                setTracks(uniqueTracks);
            } catch (err) {
                console.error('Failed to fetch artist', err);
            } finally {
                setLoading(false);
            }
        };

        if (artistId) fetchArtist();
    }, [artistId]);

    const handleTrackSelect = (index: number) => {
        setCurrentTrackIndex(index);
        setShouldAutoplay(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (loading) {
        return (
            <div className="home-page-container mp-page-container">
                <div className="home-wrapper mp-wrapper">
                    <Navbar />
                    <div className="home-content mp-content" style={{ textAlign: 'center', padding: '50px' }}>
                        Loading Artist...
                    </div>
                </div>
            </div>
        );
    }

    if (!artist) {
        return (
            <div className="home-page-container mp-page-container">
                <div className="home-wrapper mp-wrapper">
                    <Navbar />
                    <div className="home-content mp-content" style={{ textAlign: 'center', padding: '50px' }}>
                        Artist not found.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="home-page-container mp-page-container">
            <div className="home-wrapper mp-wrapper">
                <Navbar />

                <div className="home-content mp-content">
                    <div className="artist-header-section">
                        {artist.artistHeaderUrl && (
                            <div className="artist-banner">
                                <img src={artist.artistHeaderUrl} alt="" className="banner-img" />
                            </div>
                        )}
                        <div className="artist-info-bar">
                            <img src={artist.artistArtUrl || `https://robohash.org/${artist.id}.png?set=set4`} alt="" className="artist-avatar" />
                            <div className="artist-text">
                                <h2 className="mp-section-header">{artist.name}</h2>
                                {artist.bio && <p className="artist-bio">{artist.bio}</p>}
                            </div>
                        </div>
                    </div>

                    {tracks.length > 0 && (
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

                    <div className="music-grid">
                        {tracks.map((track, index) => (
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
                                        src={track.albumArtUrl || `https://robohash.org/${track.id}.png?set=set4`}
                                        alt={`${track.title} Album Art`}
                                        className="album-art"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = `https://robohash.org/${track.id}.png?set=set4`;
                                        }}
                                    />
                                    <div className="card-overlay" onClick={(e) => {
                                        e.stopPropagation();
                                        handleTrackSelect(index);
                                    }}>
                                        <button className="play-overlay-btn">Play</button>
                                    </div>
                                </div>
                                <div className="track-info">
                                    <Link to={`/music/track/${track.id}`} className="track-title" title={track.title}>
                                        {track.title}
                                    </Link>
                                    <div className="card-actions">
                                        {/* Removed redundant buttons */}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

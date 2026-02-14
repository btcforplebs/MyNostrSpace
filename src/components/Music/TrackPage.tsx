import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Navbar } from '../Shared/Navbar';
import { WavlakePlayer } from './WavlakePlayer';
import './MusicPage.css';

interface TrackData {
    id: string;
    title: string;
    artist: string;
    artistId: string;
    albumTitle?: string;
    albumArtUrl: string;
    mediaUrl: string;
    url: string; // Wavlake page link
}

export const TrackPage = () => {
    const { trackId } = useParams<{ trackId: string }>();
    const [track, setTrack] = useState<TrackData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTrack = async () => {
            try {
                const res = await fetch(`https://wavlake.com/api/v1/content/track/${trackId}`);
                if (!res.ok) throw new Error('Failed to fetch track');
                const data = await res.json();
                // Track API returns an array
                if (Array.isArray(data) && data.length > 0) {
                    setTrack(data[0]);
                } else {
                    setTrack(data);
                }
            } catch (err) {
                console.error('Failed to fetch track', err);
            } finally {
                setLoading(false);
            }
        };

        if (trackId) fetchTrack();
    }, [trackId]);

    if (loading) {
        return (
            <div className="home-page-container mp-page-container">
                <div className="home-wrapper mp-wrapper">
                    <Navbar />
                    <div className="home-content mp-content" style={{ textAlign: 'center', padding: '50px' }}>
                        Loading Track...
                    </div>
                </div>
            </div>
        );
    }

    if (!track) {
        return (
            <div className="home-page-container mp-page-container">
                <div className="home-wrapper mp-wrapper">
                    <Navbar />
                    <div className="home-content mp-content" style={{ textAlign: 'center', padding: '50px' }}>
                        Track not found.
                    </div>
                </div>
            </div>
        );
    }

    const tracksForPlayer = [
        {
            id: track.id,
            title: track.title,
            artist: track.artist,
            albumArtUrl: track.albumArtUrl,
            url: `https://embed.wavlake.com/track/${track.id}`,
            link: track.url,
        },
    ];

    return (
        <div className="home-page-container mp-page-container">
            <div className="home-wrapper mp-wrapper">
                <Navbar />

                <div className="home-content mp-content">
                    <div className="track-detail-section">
                        <div className="track-main-info">
                            <img
                                src={track.albumArtUrl || `https://robohash.org/${track.id}.png?set=set4`}
                                alt=""
                                className="track-large-art"
                            />
                            <div className="track-text-details">
                                <h2 className="mp-section-header">{track.title}</h2>
                                <div className="track-meta-links">
                                    Artist: <Link to={`/music/artist/${track.artistId}`}>{track.artist}</Link>
                                    {track.albumTitle && (
                                        <>
                                            <br />
                                            Album: <span className="album-name">{track.albumTitle}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="track-player-box" style={{ marginTop: '20px' }}>
                            <WavlakePlayer tracks={tracksForPlayer} hidePlaylist={true} autoplay={true} />
                        </div>

                        <div className="track-actions-row" style={{ marginTop: '20px' }}>
                            <a href={track.url} target="_blank" rel="noreferrer" className="wavlake-btn-external">
                                View on Wavlake
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

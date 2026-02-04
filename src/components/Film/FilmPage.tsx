import { useEffect, useState, useRef } from 'react';
import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import NDK from '@nostr-dev-kit/ndk';
import ReactPlayer from 'react-player';
import { Navbar } from '../Shared/Navbar';
import './FilmPage.css';

// Castr Movie Curator NPUB
const MOVIE_PUBKEY = '5cd5f8052c6791e4879f0e4db913465d711d5f5fe0c0ab99049c6064c5a395a2';

interface Movie {
    id: string;
    title: string;
    year: string;
    poster: string;
    videoUrl: string;
    event: NDKEvent;
}

const RELAYS = [
    'wss://relay.nostr.band',
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social'
];

export const FilmPage = () => {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
    const ndkRef = useRef<NDK | null>(null);

    useEffect(() => {
        const initNDK = async () => {
            const ndk = new NDK({ explicitRelayUrls: RELAYS });
            ndkRef.current = ndk;
            await ndk.connect();
            fetchMovies(ndk);
        };

        if (!ndkRef.current) {
            initNDK();
        }
    }, []);

    const fetchMovies = async (ndk: NDK) => {
        const filter: NDKFilter = {
            authors: [MOVIE_PUBKEY],
            kinds: [1], // Text notes containing movie info
            limit: 50
        };

        const events = await ndk.fetchEvents(filter);
        const processedMovies: Movie[] = [];

        for (const event of events) {
            const movie = parseMovieEvent(event);
            if (movie) {
                processedMovies.push(movie);
            }
        }

        setMovies(processedMovies);
        setLoading(false);
    };

    const parseMovieEvent = (event: NDKEvent): Movie | null => {
        const content = event.content;

        // Extract Title and Year (usually first line: "Title (Year)")
        const lines = content.split('\n');
        const titleLine = lines[0] || '';
        const titleMatch = titleLine.match(/^(.*?)\s*\((\d{4})\)/);

        const title = titleMatch ? titleMatch[1] : titleLine;
        const year = titleMatch ? titleMatch[2] : '';

        // Extract Poster (look for images in content or tags)
        let poster = '';
        const imgMatch = content.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp)/i);
        if (imgMatch) {
            poster = imgMatch[0];
        }

        // Extract Video URL (look for archive.org mp4 or other video/r tags)
        let videoUrl = '';

        // Priority 1: 'r' tags which are often used for citations/links
        const rTags = event.tags.filter(t => t[0] === 'r');
        const videoTag = rTags.find(t => t[1].endsWith('.mp4') || t[1].includes('archive.org'));

        if (videoTag) {
            videoUrl = videoTag[1];
        } else {
            // Priority 2: In-content link
            const vidMatch = content.match(/https?:\/\/\S+\.(?:mp4|m3u8)/i);
            if (vidMatch) {
                videoUrl = vidMatch[0];
            }
        }

        if (!videoUrl) return null; // Only show if we have a playable video

        return {
            id: event.id,
            title,
            year,
            poster,
            videoUrl,
            event
        };
    };

    return (
        <div className="film-page-container">
            <div className="film-header-area">
                <Navbar />
            </div>

            <div className="film-content">
                <h2 className="section-header">My Private Movie Collection</h2>

                {loading ? (
                    <div className="loading-spiral">Loading latest films...</div>
                ) : (
                    <div className="film-grid">
                        {movies.map(movie => (
                            <div key={movie.id} className="film-card" onClick={() => setSelectedMovie(movie)}>
                                <div className="film-poster-wrapper">
                                    <img src={movie.poster} alt={movie.title} className="film-poster" loading="lazy" />
                                </div>
                                <div className="film-info">
                                    <h3 className="film-title">{movie.title}</h3>
                                    <div className="film-year">{movie.year}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {selectedMovie && (
                <div className="film-modal-overlay" onClick={() => setSelectedMovie(null)}>
                    <div className="film-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="film-modal-header">
                            <h3>{selectedMovie.title} ({selectedMovie.year})</h3>
                            <button className="close-modal-btn" onClick={() => setSelectedMovie(null)}>×</button>
                        </div>
                        <div className="film-player-wrapper">
                            {selectedMovie.videoUrl.includes('archive.org') && !selectedMovie.videoUrl.match(/\.(mp4|webm|ogg|m3u8)$/i) ? (
                                <iframe
                                    src={selectedMovie.videoUrl.replace('/details/', '/embed/')}
                                    className="film-player"
                                    width="100%"
                                    height="100%"
                                    frameBorder="0"
                                    allowFullScreen
                                    title={selectedMovie.title}
                                />
                            ) : (
                                <ReactPlayer
                                    // @ts-ignore
                                    url={selectedMovie.videoUrl}
                                    className="film-player"
                                    width="100%"
                                    height="100%"
                                    controls
                                    playing
                                />
                            )}
                        </div>
                        <div className="film-details">
                            <p className="film-meta">Event ID: {selectedMovie.id}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

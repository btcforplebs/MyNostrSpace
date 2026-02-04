import { useEffect, useState, useRef } from 'react';
import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import NDK from '@nostr-dev-kit/ndk';
import ReactPlayer from 'react-player';
import { Navbar } from '../Shared/Navbar';
import { SEO } from '../Shared/SEO';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { useNostr } from '../../context/NostrContext';
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
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.primal.net',
];

export const FilmPage = () => {
  const { user: loggedInUser } = useNostr();
  const { layoutCss } = useCustomLayout(loggedInUser?.pubkey);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const ndkRef = useRef<NDK | null>(null);

  const cleanVideoUrl = (url: string): string => {
    try {
      // eslint-disable-next-line no-control-regex
      const decoded = decodeURIComponent(url).replace(/\u0000/g, '');
      return encodeURI(decoded);
    } catch {
      console.warn('Failed to clean video URL:', url);
      return encodeURI(url);
    }
  };

  const parseMovieEvent = (event: NDKEvent): Movie | null => {
    const content = event.content;

    if (!content.match(/^(.*?)\s*\((\d{4})\)/)) {
      return null;
    }

    const lines = content.split('\n');
    const titleLine = lines[0] || '';
    const titleMatch = titleLine.match(/^(.*?)\s*\((\d{4})\)/);

    if (!titleMatch) return null;

    const title = titleMatch[1].trim();
    const year = titleMatch[2];

    let poster = '';
    const imgMatch = content.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp)/i);
    if (imgMatch) {
      poster = imgMatch[0];
    }

    let videoUrl = '';
    const rTags = event.tags.filter((t) => t[0] === 'r');
    const videoTag = rTags.find((t) => t[1].endsWith('.mp4') || t[1].includes('archive.org'));

    if (videoTag) {
      videoUrl = videoTag[1];
    } else {
      const vidMatch = content.match(/https?:\/\/\S+\.(?:mp4|m3u8)/i);
      if (vidMatch) {
        videoUrl = vidMatch[0];
      }
    }

    if (!videoUrl) return null;

    return {
      id: event.id,
      title,
      year,
      poster,
      videoUrl: cleanVideoUrl(videoUrl),
      event,
    };
  };

  const fetchMovies = (ndk: NDK) => {
    const filter: NDKFilter = {
      authors: [MOVIE_PUBKEY],
      kinds: [1], // Text notes containing movie info
      limit: 2000,
    };

    const sub = ndk.subscribe(filter, { closeOnEose: false });

    // Batch updates to prevent UI freezing
    let eventBuffer: Movie[] = [];
    let isUpdatePending = false;

    const flushBuffer = () => {
      if (eventBuffer.length === 0) return;

      setMovies((prev) => {
        const newMovies = [...prev];
        const seenIds = new Set(prev.map((m) => m.id));

        let added = false;
        for (const movie of eventBuffer) {
          if (!seenIds.has(movie.id)) {
            newMovies.push(movie);
            seenIds.add(movie.id);
            added = true;
          }
        }

        if (!added) return prev;

        return newMovies.sort((a, b) => {
          return (b.event.created_at || 0) - (a.event.created_at || 0);
        });
      });

      eventBuffer = [];
      isUpdatePending = false;
    };

    sub.on('event', (event: NDKEvent) => {
      const movie = parseMovieEvent(event);
      if (movie) {
        eventBuffer.push(movie);
        if (!isUpdatePending) {
          isUpdatePending = true;
          setTimeout(flushBuffer, 500);
        }
      }
    });

    sub.on('eose', () => {
      flushBuffer();
      setLoading(false);
    });
  };

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

  return (
    <div className="home-page-container fp-page-container">
      {layoutCss && <style>{layoutCss}</style>}
      <SEO
        title="Films"
        description="Explore a private movie collection curated on the Nostr network."
      />

      <div className="home-wrapper fp-wrapper">
        <Navbar />

        <div className="home-content fp-content">
          <h2 className="fp-section-header">My Private Movie Collection</h2>

          {loading ? (
            <div className="fp-loading">Loading latest films...</div>
          ) : (
            <div className="fp-grid">
              {movies.map((movie) => (
                <div key={movie.id} className="fp-card" onClick={() => setSelectedMovie(movie)}>
                  <div className="fp-poster-wrapper">
                    <img
                      src={movie.poster}
                      alt={movie.title}
                      className="fp-poster"
                      loading="lazy"
                    />
                  </div>
                  <div className="fp-info">
                    <h3 className="fp-title">{movie.title}</h3>
                    <div className="fp-year">{movie.year}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedMovie && (
        <div className="fp-modal-overlay" onClick={() => setSelectedMovie(null)}>
          <div className="fp-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="fp-modal-header">
              <h3>
                {selectedMovie.title} ({selectedMovie.year})
              </h3>
              <button className="fp-close-btn" onClick={() => setSelectedMovie(null)}>
                ×
              </button>
            </div>
            <div className="fp-player-wrapper">
              {selectedMovie.videoUrl.match(/\.(mp4|webm|ogg)$/i) ? (
                <video
                  src={selectedMovie.videoUrl}
                  className="fp-video-player"
                  width="100%"
                  height="100%"
                  controls
                  autoPlay
                  playsInline
                >
                  Your browser does not support the video tag.
                </video>
              ) : selectedMovie.videoUrl.includes('archive.org') ? (
                <iframe
                  src={selectedMovie.videoUrl.replace('/details/', '/embed/')}
                  className="fp-video-player"
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  allowFullScreen
                  title={selectedMovie.title}
                />
              ) : (
                <ReactPlayer
                  // @ts-expect-error: ReactPlayer types might mismatch or missing
                  url={selectedMovie.videoUrl}
                  className="fp-react-player"
                  width="100%"
                  height="100%"
                  controls
                  playing
                />
              )}
            </div>
            <div className="fp-details">
              <p className="fp-meta">Event ID: {selectedMovie.id}</p>
              <p className="fp-url">{selectedMovie.videoUrl}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

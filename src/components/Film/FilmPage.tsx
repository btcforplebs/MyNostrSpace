import { useEffect, useState, useRef, useCallback } from 'react';
import { useNostr } from '../../context/NostrContext';
import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import NDK from '@nostr-dev-kit/ndk';
import ReactPlayer from 'react-player';
import { Navbar } from '../Shared/Navbar';
import './FilmPage.css';

// Castr Movie Curator NPUB
const MOVIE_PUBKEY = '5cd5f8052c6791e4879f0e4db913465d711d5f5fe0c0ab99049c6064c5a395a2';

// Critical relays for movie content
const FILM_RELAYS = [
  'wss://nostr.mom',
  'wss://nos.lol',
  'wss://relay.damus.io',
];

interface Movie {
  id: string;
  title: string;
  year: string;
  poster: string;
  videoUrl: string;
  event: NDKEvent;
}

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

  // Relaxed regex to match more formats, but still look for Title (Year) pattern
  // roughly match start of line, some text, then (Year)
  const titleMatch = content.match(/^(.*?)\s*\((\d{4})\)/m);

  if (!titleMatch) return null;

  const title = titleMatch[1].trim();
  const year = titleMatch[2];

  let poster = '';
  // Look for image extensions
  const imgMatch = content.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp)/i);
  if (imgMatch) {
    poster = imgMatch[0];
  }

  let videoUrl = '';
  // Priority 1: 'r' tags with .mp4 or archive.org
  const rTags = event.tags.filter((t) => t[0] === 'r');
  const videoTag = rTags.find((t) => t[1].endsWith('.mp4') || t[1].includes('archive.org'));

  if (videoTag) {
    videoUrl = videoTag[1];
  } else {
    // Priority 2: In-content link
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

export const FilmPage = () => {
  const { ndk } = useNostr();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const mountedRef = useRef(true);

  // Use a ref for movies to check duplicates without dependency issues
  const moviesRef = useRef<Set<string>>(new Set());

  const fetchMovies = useCallback(
    (ndk: NDK) => {
      const filter: NDKFilter = {
        authors: [MOVIE_PUBKEY],
        kinds: [1], // Text notes containing movie info
        limit: 2000, // Significantly increased limit
      };

      // Use the global pool. If we needed specific relays, we could try to add them, 
      // but explicitRelayUrls on NDK constructor is the cleanest way for isolated instances.
      // Since we are using the global one, we trust its pool.
      // However, we might want to ensure we have coverage.
      const sub = ndk.subscribe(filter, { closeOnEose: false });

      // Batch updates to prevent UI freezing
      let eventBuffer: Movie[] = [];
      let isUpdatePending = false;

      const flushBuffer = () => {
        if (!mountedRef.current) return;
        if (eventBuffer.length === 0) {
          // If we have some movies, we are good. If 0, we might still be loading or have none.
          // But we don't want to spin forever if EOSE happened.
          // We handle loading state in EOSE or via checking buffer length.
          // But here flushBuffer is called on EOSE too.
          if (loading) setLoading(false);
          return;
        }

        setMovies((prev) => {
          const newMovies = [...prev];
          let added = false;

          for (const movie of eventBuffer) {
            if (!moviesRef.current.has(movie.id)) {
              newMovies.push(movie);
              moviesRef.current.add(movie.id);
              added = true;
            }
          }

          if (!added) return prev;

          return newMovies.sort((a, b) => {
            return (b.event.created_at || 0) - (a.event.created_at || 0);
          });
        });

        setLoading(false); // First batch received, stop loading spinner
        eventBuffer = [];
        isUpdatePending = false;
      };

      sub.on('event', (event: NDKEvent) => {
        // console.log('DEBUG: Event received', event.id);
        const movie = parseMovieEvent(event);
        if (movie) {
          eventBuffer.push(movie);
          if (!isUpdatePending) {
            isUpdatePending = true;
            setTimeout(flushBuffer, 500); // Debounce updates
          }
        }
      });

      sub.on('eose', () => {
        flushBuffer();
        // Force loading off on EOSE if we haven't found anything yet? 
        // flushBuffer handles it.
      });
    },
    [loading] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    mountedRef.current = true;

    if (ndk) {
      // Ensure we are connected to the film relays
      FILM_RELAYS.forEach((url) => {
        try {
          ndk.addExplicitRelay(url, undefined);
        } catch (e) {
          console.warn(`Failed to add relay ${url}:`, e);
        }
      });

      // Debug logs
      setTimeout(() => {
        console.log('DEBUG: Connected relays:', ndk.pool.connectedRelays().map(r => r.url));
        console.log('DEBUG: FILM_RELAYS:', FILM_RELAYS);
      }, 2000);

      fetchMovies(ndk);
    }

    return () => {
      mountedRef.current = false;
    };
  }, [fetchMovies, ndk]);

  return (
    <div className="film-page-container">
      <div className="film-header-area">
        <Navbar />
      </div>

      <div className="film-content">
        <div
          className="fp-header-row"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <h2 className="section-header">My Private Movie Collection</h2>
          {!loading && <div style={{ color: '#666' }}>Found {movies.length} films</div>}
        </div>

        {loading && movies.length === 0 ? (
          <div className="loading-spiral">Loading latest films...</div>
        ) : (
          <div className="film-grid">
            {movies.map((movie) => (
              <div key={movie.id} className="film-card" onClick={() => setSelectedMovie(movie)}>
                <div className="film-poster-wrapper">
                  {movie.poster ? (
                    <img
                      src={movie.poster}
                      alt={movie.title}
                      className="film-poster"
                      loading="lazy"
                      onError={(e) => {
                        // Fallback for broken images
                        (e.target as HTMLImageElement).src =
                          'https://via.placeholder.com/300x450?text=No+Poster';
                      }}
                    />
                  ) : (
                    <div className="film-poster-placeholder">
                      <span>{movie.title}</span>
                    </div>
                  )}
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
          <div className="film-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="film-modal-header">
              <h3>
                {selectedMovie.title} ({selectedMovie.year})
              </h3>
              <button className="close-modal-btn" onClick={() => setSelectedMovie(null)}>
                ×
              </button>
            </div>
            <div className="film-player-wrapper">
              {selectedMovie.videoUrl.match(/\.(mp4|webm|ogg)$/i) ? (
                <video
                  src={selectedMovie.videoUrl}
                  className="film-player"
                  width="100%"
                  height="100%"
                  controls
                  autoPlay
                  playsInline
                >
                  Your browser does not support the video tag.
                </video>
              ) : selectedMovie.videoUrl.includes('archive.org') &&
                !selectedMovie.videoUrl.match(/\.mp4$/) ? (
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
                  // @ts-expect-error ReactPlayer types are notoriously tricky with strict mode
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

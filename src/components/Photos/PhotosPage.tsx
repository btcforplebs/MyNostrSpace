import { useEffect, useState, useRef, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { type NDKFilter, NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import { SEO } from '../Shared/SEO';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { isBlockedUser, hasBlockedKeyword, BLOCKED_TAGS } from '../../utils/blockedUsers';
import './PhotosPage.css';

interface PhotoFile {
  id: string;
  pubkey: string;
  url: string;
  title: string;
  authorName?: string;
  created_at: number;
}

// Memoized photo card component to prevent unnecessary re-renders
const PhotoCard = memo(({ photo, onSelect }: { photo: PhotoFile; onSelect: (photo: PhotoFile) => void }) => (
  <div
    className="pp-photo-card"
    onClick={() => onSelect(photo)}
  >
    <div className="pp-image-container">
      <img
        src={photo.url}
        alt={photo.title}
        className="pp-photo-image"
        loading="lazy"
        decoding="async"
      />
    </div>
    <div className="pp-photo-info">
      <div className="pp-photo-title" title={photo.title}>
        {photo.title}
      </div>
      <Link
        to={`/p/${photo.pubkey}`}
        className="pp-photo-author"
        onClick={(e) => e.stopPropagation()}
      >
        By: {photo.authorName || photo.pubkey.slice(0, 8)}
      </Link>
    </div>
  </div>
));

export const PhotosPage = () => {
  const { ndk, user: loggedInUser } = useNostr();
  const { layoutCss } = useCustomLayout(loggedInUser?.pubkey);
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoFile | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Responsive Columns State
  const [columnCount, setColumnCount] = useState(3);

  const photoBufferRef = useRef<PhotoFile[]>([]);
  const isUpdatePendingRef = useRef(false);
  const fetchingRef = useRef(false);
  const loadTrackerRef = useRef(0);

  const checkIsNSFW = (event: NDKEvent): boolean => {
    const tags = event.tags.map((t) => t[1]?.toLowerCase());
    if (tags.some((t) => BLOCKED_TAGS.includes(t))) return true;

    const cw = event.getMatchingTags('content-warning')[0]?.[1];
    if (cw) return true;

    const textToMatch = [
      event.content,
      event.getMatchingTags('title')[0]?.[1],
      event.getMatchingTags('description')[0]?.[1],
      event.getMatchingTags('alt')[0]?.[1],
    ].join(' ');

    return hasBlockedKeyword(textToMatch);
  };

  const processBuffer = useCallback(() => {
    if (photoBufferRef.current.length === 0) return;

    setPhotos((prev) => {
      const next = [...prev];
      let changed = false;

      for (const photo of photoBufferRef.current) {
        if (!next.find((p) => p.id === photo.id)) {
          next.push(photo);
          changed = true;
        }
      }

      photoBufferRef.current = [];
      isUpdatePendingRef.current = false;

      if (!changed) return prev;
      return next.sort((a, b) => b.created_at - a.created_at);
    });
  }, []);

  const handleEvent = useCallback(
    (event: NDKEvent) => {
      if (isBlockedUser(event.pubkey)) return;
      if (checkIsNSFW(event)) return;

      let url: string | undefined;
      let title = '';

      if (event.kind === 1) {
        const content = event.content;
        const imetaTags = event.getMatchingTags('imeta');

        // Check imeta tags first
        for (const tag of imetaTags) {
          let tagUrl: string | undefined;
          let tagMime: string | undefined;
          for (let i = 1; i < tag.length; i++) {
            const part = tag[i];
            if (part === 'url') tagUrl = tag[i + 1];
            else if (part.startsWith('url ')) tagUrl = part.slice(4);
            else if (part === 'm') tagMime = tag[i + 1];
            else if (part.startsWith('m ')) tagMime = part.slice(2);
          }
          if (tagUrl && tagMime?.startsWith('image/')) {
            url = tagUrl;
            break;
          }
        }

        if (!url) {
          // Extract image URL from content
          const imgMatches = content.match(
            /https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif)(\?[^\s]*)?/i
          );
          if (imgMatches) {
            url = imgMatches[0];
          }
        }

        if (url) {
          if (loadingMore) {
            loadTrackerRef.current++;
          }

          // Use first line or title tag as title
          const titleTag = event.getMatchingTags('title')[0]?.[1];
          if (titleTag) {
            title = titleTag;
          } else {
            const lines = content
              .split('\n')
              .map((l) => l.trim())
              .filter(
                (l) =>
                  l.length > 0 &&
                  !l.startsWith('http') &&
                  !l.startsWith('ws') &&
                  !l.startsWith('nostr:') &&
                  !l.includes(url!)
              );
            title = lines[0]?.length > 100 ? lines[0].slice(0, 100) + '...' : lines[0];
          }

          if (!title) title = 'Untitled Photo';

          const photo: PhotoFile = {
            id: event.id,
            pubkey: event.pubkey,
            url,
            title,
            created_at: event.created_at || 0,
          };

          photoBufferRef.current.push(photo);
          if (!isUpdatePendingRef.current) {
            isUpdatePendingRef.current = true;
            setTimeout(processBuffer, 300);
          }

          // Defer profile fetching to avoid blocking
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => {
              ndk
                ?.getUser({ pubkey: event.pubkey })
                .fetchProfile()
                .then((profile) => {
                  setPhotos((prev) =>
                    prev.map((p) =>
                      p.pubkey === event.pubkey && !p.authorName
                        ? {
                          ...p,
                          authorName:
                            profile?.name ||
                            profile?.displayName ||
                            profile?.nip05 ||
                            event.pubkey.slice(0, 8),
                        }
                        : p
                    )
                  );
                })
                .catch(() => { });
            });
          } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(() => {
              ndk
                ?.getUser({ pubkey: event.pubkey })
                .fetchProfile()
                .then((profile) => {
                  setPhotos((prev) =>
                    prev.map((p) =>
                      p.pubkey === event.pubkey && !p.authorName
                        ? {
                          ...p,
                          authorName:
                            profile?.name ||
                            profile?.displayName ||
                            profile?.nip05 ||
                            event.pubkey.slice(0, 8),
                        }
                        : p
                    )
                  );
                })
                .catch(() => { });
            }, 100);
          }
        }
      }
    },
    [ndk, loadingMore, processBuffer]
  );

  useEffect(() => {
    if (!ndk) return;

    setLoading(true);

    const filter: NDKFilter = {
      kinds: [1],
      limit: 100,
    };

    const sub = ndk.subscribe(filter, {
      closeOnEose: false,
      cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
    });

    sub.on('event', handleEvent);
    sub.on('eose', () => {
      setLoading(false);
      processBuffer();
      console.log('Photos Page: Initial fetch complete');
    });

    return () => {
      sub.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ndk, handleEvent]);

  const handleLoadMore = useCallback(async () => {
    if (!ndk || photos.length === 0 || loadingMore || fetchingRef.current || !hasMore) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    loadTrackerRef.current = 0;

    const oldestTimestamp = Math.min(...photos.map((p) => p.created_at));
    console.log(
      'Photos Page: Loading more photos before',
      new Date(oldestTimestamp * 1000).toLocaleString()
    );

    const filter: NDKFilter = {
      kinds: [1],
      until: oldestTimestamp - 1,
      limit: 100,
    };

    const sub = ndk.subscribe(filter, { closeOnEose: true });
    sub.on('event', handleEvent);
    sub.on('eose', () => {
      setLoadingMore(false);
      fetchingRef.current = false;
      processBuffer();

      if (loadTrackerRef.current === 0) {
        console.log('Photos Page: No more photos found, disabling infinite scroll.');
        setHasMore(false);
      }

      console.log('Photos Page: Load More complete, found:', loadTrackerRef.current);
    });
  }, [ndk, photos, loadingMore, hasMore, handleEvent, processBuffer]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollBottom = window.innerHeight + window.scrollY;
      const threshold = document.body.offsetHeight - 800;

      if (
        scrollBottom >= threshold &&
        !fetchingRef.current &&
        photos.length > 0 &&
        !loadingMore &&
        hasMore
      ) {
        handleLoadMore();
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [photos.length, loadingMore, hasMore, handleLoadMore]);

  // Handle Resize for Responsive Columns
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width <= 600) {
        setColumnCount(1);
      } else if (width <= 900) {
        setColumnCount(2);
      } else {
        setColumnCount(3);
      }
    };

    // Initial check
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Distribute photos into columns (Round Robin)
  const columns = Array.from({ length: columnCount }, () => [] as PhotoFile[]);
  photos.forEach((photo, index) => {
    columns[index % columnCount].push(photo);
  });

  return (
    <div className="home-page-container pp-page-container">
      {layoutCss && <style>{layoutCss}</style>}
      <SEO title="Photos" description="Discover photos shared across the Nostr network." />

      <div className="home-wrapper pp-wrapper">
        <Navbar />

        <div className="home-content pp-content">
          <h2 className="pp-section-header">Last Photos from Relays</h2>

          {loading && photos.length === 0 ? (
            <div className="pp-loading-state">
              <div className="pp-spinner"></div>
              <p>Searching for photos on Nostr...</p>
            </div>
          ) : (
            <>
              <div className="pp-photos-grid-container">
                {columns.map((colPhotos, colIndex) => (
                  <div key={colIndex} className="pp-masonry-column">
                    {colPhotos.map((photo) => (
                      <PhotoCard
                        key={photo.id}
                        photo={photo}
                        onSelect={setSelectedPhoto}
                      />
                    ))}
                  </div>
                ))}
              </div>

              {loadingMore && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                  Loading older photos...
                </div>
              )}

              {!loadingMore && hasMore && photos.length > 0 && (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <button
                    onClick={handleLoadMore}
                    style={{
                      padding: '12px 24px',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#fff',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                  >
                    Load More Photos
                  </button>
                </div>
              )}
            </>
          )}

          {!loading && photos.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              No photos found. Check back later or try adding more relays!
            </div>
          )}
        </div>
      </div>

      {selectedPhoto && (
        <div className="pp-modal-overlay" onClick={() => setSelectedPhoto(null)}>
          <div className="pp-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="pp-close-btn" onClick={() => setSelectedPhoto(null)}>
              ×
            </button>
            <img src={selectedPhoto.url} alt={selectedPhoto.title} className="pp-modal-image" decoding="async" />
            <div className="pp-modal-footer">
              <Link to={`/p/${selectedPhoto.pubkey}`} className="pp-modal-author">
                By: {selectedPhoto.authorName || selectedPhoto.pubkey.slice(0, 8)}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKKind, type NDKUserProfile } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import { SEO } from '../Shared/SEO';
import './LiveStreamPage.css'; // Re-use existing css if appropriate or create new

const PINNED_PUBKEY = 'cf45a6ba1363ad7ed213a078e710d24115ae721c9b47bd1ebf4458eaefb4c2a5';

export const LivestreamsPage = () => {
  const { ndk } = useNostr();
  const [liveStreams, setLiveStreams] = useState<NDKEvent[]>([]);
  const [activeProfiles, setActiveProfiles] = useState<Record<string, NDKUserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subRef = useRef<any>(null);

  useEffect(() => {
    if (!ndk) return;

    const startSubscription = async () => {
      // Start subscription immediately (don't wait for connections)
      const liveStreamSub = ndk.subscribe(
        [
          { kinds: [30311 as NDKKind], limit: 100 },
          { kinds: [30311 as NDKKind], authors: [PINNED_PUBKEY] },
        ],
        { closeOnEose: false }
      );

      let hasReceivedEose = false;

      // Turn off loading when we've received initial data
      liveStreamSub.on('eose', () => {
        hasReceivedEose = true;
        setLoading(false);
      });

      // Fallback timeout in case EOSE never comes
      const timeoutId = setTimeout(() => {
        if (!hasReceivedEose) {
          setLoading(false);
        }
      }, 3000);

      liveStreamSub.on('event', async (event: NDKEvent) => {
        const statusTag = event.getMatchingTags('status')[0];
        const status = statusTag ? statusTag[1].toLowerCase() : undefined;
        const streamingTag = event.getMatchingTags('streaming')[0];

        // Simple, clear live check
        const isLive =
          status === 'live' ||
          status === 'broadcasting' ||
          status === 'active' ||
          (!status && !!streamingTag); // No status but has streaming URL

        const isEnded = status === 'ended' || status === 'offline';

        if (isEnded) {
          // Remove this stream
          setLiveStreams((prev) => prev.filter((e) => e.id !== event.id));
          return;
        }

        if (!isLive) {
          return; // Ignore non-live streams
        }

        // Add or update the stream
        setLiveStreams((prev) => {
          // Remove old version if exists
          const filtered = prev.filter((e) => e.id !== event.id);
          const updated = [...filtered, event];

          // Sort: pinned first, then by time
          updated.sort((a, b) => {
            if (a.pubkey === PINNED_PUBKEY && b.pubkey !== PINNED_PUBKEY) return -1;
            if (a.pubkey !== PINNED_PUBKEY && b.pubkey === PINNED_PUBKEY) return 1;
            return (b.created_at || 0) - (a.created_at || 0);
          });

          return updated;
        });

        // Fetch profile for stream host
        const hostPubkey = event.getMatchingTags('p')[0]?.[1] || event.pubkey;
        if (hostPubkey && !activeProfiles[hostPubkey]) {
          event.author
            .fetchProfile()
            .then((profile) => {
              if (profile) {
                setActiveProfiles((curr) => ({ ...curr, [hostPubkey]: profile }));
              }
            })
            .catch(() => {});
        }
      });

      subRef.current = {
        stop: () => {
          liveStreamSub.stop();
          clearTimeout(timeoutId);
        },
      };
    };

    startSubscription();

    return () => {
      if (subRef.current) subRef.current.stop();
    };
  }, [ndk, activeProfiles]);

  return (
    <div className="livestreams-page-container">
      <SEO title="Livestreams" description="Watch live streams on MyNostrSpace" />
      <div className="livestreams-header">
        <Navbar />
      </div>

      <div className="livestreams-content">
        <h2 className="section-header">Live Now</h2>

        {loading && <div style={{ padding: '20px' }}>Loading streams...</div>}

        <div className="streams-grid">
          {liveStreams.length === 0 && !loading && (
            <div style={{ padding: '20px' }}>
              No active livestreams found right now. Check back later!
            </div>
          )}

          {liveStreams.map((stream) => {
            const title = stream.getMatchingTags('title')[0]?.[1] || 'Untitled Stream';
            const image = stream.getMatchingTags('image')[0]?.[1];
            const dTag = stream.getMatchingTags('d')[0]?.[1];
            const hostPubkey = stream.getMatchingTags('p')[0]?.[1] || stream.pubkey;
            const url = `/live/${hostPubkey}/${dTag}`;
            const profile = activeProfiles[hostPubkey];

            return (
              <Link key={stream.id} to={url} className="stream-card">
                <div className="stream-card-thumb">
                  {image && !brokenImages.has(stream.id) ? (
                    <img
                      src={image}
                      alt={title}
                      onError={() => setBrokenImages((prev) => new Set(prev).add(stream.id))}
                    />
                  ) : (
                    <div className="stream-no-image">LIVE</div>
                  )}
                  <div className="live-badge">LIVE</div>
                </div>
                <div className="stream-card-info">
                  <div className="stream-card-title">{title}</div>
                  <div className="stream-card-host">
                    Host: {profile?.name || profile?.display_name || hostPubkey.slice(0, 8)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <style>{`
        .livestreams-page-container {
            width: 100%;
            max-width: 992px;
            margin: 0 auto;
            background: white;
            min-height: 100vh;
        }
        .livestreams-content {
            padding: 20px;
        }
        .section-header {
            background-color: #6699cc;
            color: white;
            padding: 5px 10px;
            margin-bottom: 15px;
            font-weight: bold;
        }
        .streams-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 20px;
        }
        .stream-card {
            border: 1px solid #ccc;
            text-decoration: none;
            color: inherit;
            display: flex;
            flex-direction: column;
            background: white;
            transition: transform 0.2s;
        }
        .stream-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        .stream-card-thumb {
            aspect-ratio: 16/9;
            background: #000;
            position: relative;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .stream-card-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .stream-no-image {
            color: #ff4444;
            font-weight: bold;
            font-size: 24px;
        }
        .live-badge {
            position: absolute;
            top: 10px;
            right: 10px;
            background: red;
            color: white;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: bold;
        }
        .stream-card-info {
            padding: 10px;
        }
        .stream-card-title {
            font-weight: bold;
            color: #003399;
            margin-bottom: 5px;
            font-size: 14px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .stream-card-host {
            font-size: 12px;
            color: #666;
        }
        @media (min-width: 1000px) {
            .livestreams-page-container {
                margin: 20px auto;
                border: 1px solid #ccc;
            }
        }
      `}</style>
    </div>
  );
};

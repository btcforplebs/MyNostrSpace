import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import { WavlakePlayer } from '../Music/WavlakePlayer';
import './LandingPage.css';

export const LandingPage = () => {
  const { login, loginWithNip46, ndk } = useNostr();
  const [globalEvents, setGlobalEvents] = useState<NDKEvent[]>([]);
  const [liveStreams, setLiveStreams] = useState<NDKEvent[]>([]);
  const [articles, setArticles] = useState<NDKEvent[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeProfiles, setActiveProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [bunkerInput, setBunkerInput] = useState('');
  const [loginMethod, setLoginMethod] = useState<'extension' | 'remote'>('extension');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [trendingTracks, setTrendingTracks] = useState<
    { title: string; url: string; link: string }[]
  >([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subRef = useRef<any>(null);

  useEffect(() => {
    if (!ndk) return;

    let isMounted = true;

    const startSubscription = async () => {
      // Connect if not connected
      if (ndk.pool.stats().connected === 0) {
        try {
          // Add specialized relays for better content density
          ndk.addExplicitRelay('wss://relay.zap.stream', undefined);
          ndk.addExplicitRelay('wss://nos.lol', undefined);
          ndk.addExplicitRelay('wss://relay.damus.io', undefined);
          await ndk.connect(2500);
        } catch {
          console.warn('NDK connection timeout on landing');
        }
      }

      if (!isMounted) return;

      // Subscribe to recent notes
      // Subscribe to recent notes and live events
      const sub = ndk.subscribe(
        { kinds: [NDKKind.Text, 30311 as NDKKind, 30023 as NDKKind], limit: 100 },
        { closeOnEose: false }
      );

      sub.on('event', async (event: NDKEvent) => {
        if (!isMounted) return;

        if (event.kind === NDKKind.Text) {
          setGlobalEvents((prev) => {
            if (prev.find((e) => e.id === event.id)) return prev;
            const newList = [event, ...prev];
            return newList.slice(0, 10);
          });
        } else if (event.kind === (30311 as NDKKind)) {
          // Only keep 'live' streams
          const status = event.getMatchingTags('status')[0]?.[1];
          if (status === 'live') {
            setLiveStreams((prev) => {
              if (prev.find((e) => e.id === event.id)) return prev;
              const newList = [event, ...prev];
              return newList.slice(0, 10);
            });
          }
        } else if (event.kind === (30023 as NDKKind)) {
          setArticles((prev) => {
            if (prev.find((e) => e.id === event.id)) return prev;
            const newList = [event, ...prev];
            return newList.slice(0, 5);
          });
        }

        // Fetch profile if not already known
        setActiveProfiles((prev) => {
          if (prev[event.pubkey]) return prev;

          // Trigger fetch in background
          const user = ndk.getUser({ pubkey: event.pubkey });
          user
            .fetchProfile()
            .then((profile) => {
              if (profile && isMounted) {
                setActiveProfiles((current) => ({
                  ...current,
                  [event.pubkey]: profile,
                }));
              }
            })
            .catch(() => { });

          return prev;
        });

        setHasLoaded(true);
      });

      subRef.current = sub;
    };

    startSubscription();

    return () => {
      isMounted = false;
      if (subRef.current) subRef.current.stop();
    };
  }, [ndk]);

  useEffect(() => {
    fetch('https://wavlake.com/api/v1/content/rankings?sort=sats&days=7')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formatted = data.slice(0, 10).map((item: any) => ({
            title: `${item.artist} - ${item.title}`,
            url: item.mediaUrl,
            link: item.url,
          }));
          setTrendingTracks(formatted);
        }
      })
      .catch((err) => console.error('Failed to fetch Wavlake trending', err));
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      if (loginMethod === 'remote') {
        await loginWithNip46(bunkerInput);
      } else {
        await login();
      }
    } catch (err) {
      console.error('Login failed', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-container">
      {/* Header Area */}
      <header className="landing-header">
        <div className="logo-area">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/mynostrspace_logo.png" alt="MyNostrSpace" className="landing-logo" />
            <h1>MyNostrSpace</h1>
          </div>
          <span className="slogan">a place for friends</span>
        </div>

        <div className="header-right">
          <div className="header-links">
            <a href="#">Help</a> | <a href="#">Sign Up</a>
          </div>
          <div className="header-search">
            <form onSubmit={(e) => e.preventDefault()}>
              <input type="text" placeholder="People" />
              <button type="submit">Search</button>
            </form>
            <div className="powered-by">
              powered by <span>Nostr</span>
            </div>
          </div>
        </div>
      </header>

      {/* Blue Nav Bar */}
      <nav className="landing-nav">
        <a href="#">Home</a> | <a href="#">Browse</a> | <a href="#">Search</a> |{' '}
        <a href="#">Invite</a> | <a href="#">Film</a> | <a href="#">Mail</a> | <a href="#">Blog</a>{' '}
        | <a href="#">Favorites</a> | <a href="#">Forum</a> | <a href="#">Groups</a> |{' '}
        <a href="#">Events</a> | <a href="#">Videos</a> | <a href="#">Music</a> |{' '}
        <a href="#">Comedy</a> | <a href="#">Classifieds</a>
      </nav>

      <div className="landing-body">
        {/* Left Column (Stats & Login) */}
        <div className="landing-sidebar">
          <div className="content-box">
            <div className="content-box-header">Member Login</div>
            <div className="login-box">
              <div className="login-tabs">
                <button
                  className={`login-tab-btn ${loginMethod === 'extension' ? 'active' : ''}`}
                  onClick={() => setLoginMethod('extension')}
                >
                  Extension
                </button>
                <button
                  className={`login-tab-btn ${loginMethod === 'remote' ? 'active' : ''}`}
                  onClick={() => setLoginMethod('remote')}
                >
                  Remote
                </button>
              </div>

              <form className="login-form" onSubmit={handleLogin}>
                {loginMethod === 'extension' ? (
                  <button
                    type="submit"
                    className="login-submit-btn btn-extension"
                    disabled={loading}
                    style={{ width: '100%' }}
                  >
                    {loading ? 'Connecting...' : 'Login with Extension'}
                  </button>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="bunker://..."
                      value={bunkerInput}
                      onChange={(e) => setBunkerInput(e.target.value)}
                      style={{ width: '100%', marginBottom: '10px' }}
                    />
                    <button
                      type="submit"
                      className="login-submit-btn btn-remote"
                      disabled={loading}
                      style={{ width: '100%' }}
                    >
                      {loading ? 'Connecting...' : 'Connect Bunker'}
                    </button>
                  </>
                )}
              </form>
            </div>
          </div>

          <div className="content-box">
            <div className="content-box-header">Trending Songs</div>
            <div className="retro-player-container">
              <WavlakePlayer
                tracks={trendingTracks}
                trackUrl={
                  trendingTracks.length === 0
                    ? 'https://embed.wavlake.com/track/6290884d-ca9d-487e-97ca-e48359b3781b'
                    : undefined
                }
                hideHeader={true}
              />
            </div>
          </div>

          <div className="content-box">
            <div className="content-box-header">The Nostr Galaxy</div>
            <div className="galaxy-grid">
              <a
                href="https://nosotros.app"
                target="_blank"
                rel="noreferrer"
                className="galaxy-item"
              >
                <img
                  src="https://raw.githubusercontent.com/KoalaSat/nostros/master/metadata/en-US/images/icon.png"
                  alt=""
                  onError={(e) => (e.currentTarget.src = 'https://nosotros.app/favicon.ico')}
                />
                <span>Nosotros</span>
              </a>
              <a
                href="https://jumble.social"
                target="_blank"
                rel="noreferrer"
                className="galaxy-item"
              >
                <img src="https://jumble.social/favicon.ico" alt="" />
                <span>Jumble</span>
              </a>
              <a
                href="https://nostrudel.ninja"
                target="_blank"
                rel="noreferrer"
                className="galaxy-item"
              >
                <img src="https://nostrudel.ninja/favicon.ico" alt="" />
                <span>Nostrudel</span>
              </a>
              <a
                href="https://fevela.me"
                target="_blank"
                rel="noreferrer"
                className="galaxy-item"
              >
                <img src="https://fevela.me/favicon.ico" alt="" />
                <span>Fevela</span>
              </a>
              <a
                href="https://zap.stream"
                target="_blank"
                rel="noreferrer"
                className="galaxy-item"
              >
                <img src="https://zap.stream/icons/icon-512x512.png" alt="" onError={(e) => (e.currentTarget.src = 'https://zap.stream/favicon.ico')} />
                <span>Zap.stream</span>
              </a>
              <a
                href="https://wavlake.com"
                target="_blank"
                rel="noreferrer"
                className="galaxy-item"
              >
                <img src="https://wavlake.com/favicon.ico" alt="" />
                <span>Wavlake</span>
              </a>
              <a
                href="https://damus.io"
                target="_blank"
                rel="noreferrer"
                className="galaxy-item"
              >
                <img src="https://damus.io/favicon.ico" alt="" />
                <span>Damus</span>
              </a>
              <a
                href="https://primal.net"
                target="_blank"
                rel="noreferrer"
                className="galaxy-item"
              >
                <img src="https://primal.net/assets/icons/logo_white_on_purple.png" alt="" onError={(e) => (e.currentTarget.src = 'https://primal.net/favicon.ico')} />
                <span>Primal</span>
              </a>
            </div>
          </div>
        </div>

        {/* Right Column (Marketing & Feed) */}
        <div className="landing-main">
          <section className="marketing-box">
            <h2>
              mynostrspace.com is an online community that lets you meet your friends' friends.
            </h2>
            <p>
              Share photos, journals and interests with your growing network of mutual friends on
              Nostr!
            </p>
            <div style={{ marginTop: '10px' }}>
              <button className="signup-large-btn" onClick={() => handleLogin()}>
                Get Started!
              </button>
            </div>
          </section>

          <div className="content-box">
            <div className="content-box-header">Cool New People [active now]</div>
            <div className="people-grid">
              {Object.keys(activeProfiles).length > 0
                ? Object.entries(activeProfiles)
                  .slice(0, 8)
                  .map(([pk, profile]) => (
                    <div key={pk} className="person-item">
                      <Link to={`/p/${pk}`} className="person-link">
                        <div className="person-name">
                          {profile.name || profile.display_name || 'Anon'}
                        </div>
                        <div className="person-pic">
                          <img
                            src={profile.picture || `https://robohash.org/${pk}?set=set4`}
                            alt=""
                          />
                        </div>
                      </Link>
                    </div>
                  ))
                : [...Array(8)].map((_, i) => (
                  <div key={i} className="person-item">
                    <div className="person-name">...</div>
                    <div className="person-pic">
                      <div
                        style={{ width: '80px', height: '80px', backgroundColor: '#eee' }}
                      ></div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="content-box">
            <div className="content-box-header">Nostr Global Stream [live]</div>
            <div className="global-feed-list">
              {globalEvents.map((event) => (
                <div key={event.id} className="feed-item">
                  <span className="feed-time">
                    {new Date(event.created_at! * 1000).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="feed-author">
                    {activeProfiles[event.pubkey]?.name || event.pubkey.slice(0, 8)}:
                  </span>
                  <span className="feed-content">{event.content.slice(0, 70)}...</span>
                </div>
              ))}
              {!hasLoaded && <div style={{ padding: '10px' }}>Connecting to relays...</div>}
            </div>
          </div>

          <div className="content-box">
            <div className="content-box-header">Livestreams Happening Now [live]</div>
            <div className="live-streams-list">
              {liveStreams.length > 0 ? (
                liveStreams.map((stream) => {
                  const title = stream.getMatchingTags('title')[0]?.[1] || 'Untitled Stream';
                  const image = stream.getMatchingTags('image')[0]?.[1];
                  const dTag = stream.getMatchingTags('d')[0]?.[1];
                  const url = `https://zap.stream/${stream.pubkey}/${dTag}`;

                  return (
                    <a
                      key={stream.id}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="stream-item"
                    >
                      <div className="stream-thumb">
                        {image ? (
                          <img src={image} alt="" />
                        ) : (
                          <div className="stream-no-image">LIVE</div>
                        )}
                      </div>
                      <div className="stream-info">
                        <div className="stream-title">{title}</div>
                        <div className="stream-host">
                          {activeProfiles[stream.pubkey]?.name || stream.pubkey.slice(0, 8)}
                        </div>
                      </div>
                    </a>
                  );
                })
              ) : (
                <div className="zap-stream-promo">
                  <a href="https://zap.stream" target="_blank" rel="noreferrer">
                    <span className="zap-brand">Watch on zap.stream</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="content-box">
            <div className="content-box-header">Recent Articles [read]</div>
            <div className="article-list">
              {articles.map((article) => {
                const title = article.getMatchingTags('title')[0]?.[1] || 'Untitled Article';
                const dTag = article.getMatchingTags('d')[0]?.[1] || '';
                // Using speaks.news as a solid long-form reader
                const url = `https://speaks.news/${article.pubkey}/${dTag}`;

                return (
                  <a
                    key={article.id}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="article-item"
                  >
                    <div className="article-title">{title}</div>
                    <div className="article-meta">
                      by {activeProfiles[article.pubkey]?.name || article.pubkey.slice(0, 8)}
                    </div>
                  </a>
                );
              })}
              {articles.length === 0 && <div className="loading-text">Loading articles...</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="bottom-promo-grid">
        <div className="promo-item">
          <h3>Get Started!</h3>
          <p>Join for free, view profiles, connect with others, blog, and more!</p>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handleLogin();
            }}
          >
            Learn More
          </a>
        </div>
        <div className="promo-item">
          <h3>Web Extension</h3>
          <p>Use Alby or nos2x to securely manage your keys in your browser.</p>
          <a href="https://getalby.com" target="_blank" rel="noreferrer">
            Get Alby
          </a>
        </div>
        <div className="promo-item">
          <h3>Blossom</h3>
          <p>Host your files on Blossom servers. Faster, cheaper, and censorship resistant.</p>
          <a href="https://blossom.watch" target="_blank" rel="noreferrer">
            Learn More
          </a>
        </div>
        <div className="promo-item">
          <h3>Host Your Media</h3>
          <p>Upload photos and videos to the most popular Nostr image host.</p>
          <a href="https://nostr.build" target="_blank" rel="noreferrer">
            nostr.build
          </a>
        </div>
      </div>

      <footer className="landing-footer">
        <div className="footer-links">
          <a href="#">About</a> | <a href="#">FAQ</a> | <a href="#">Terms</a> |{' '}
          <a href="#">Privacy</a> | <a href="#">Safety Tips</a> |{' '}
          <a href="#">Contact MyNostrSpace</a> | <a href="#">Report Inappropriate Content</a> |{' '}
          <a href="#">Promote!</a> | <a href="#">Advertise</a>
        </div>
        <div>© 2003-2026 mynostrspace.com. All Rights Reserved.</div>
      </footer>
    </div>
  );
};

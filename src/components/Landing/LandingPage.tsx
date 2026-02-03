import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, NDKKind, type NDKFilter } from '@nostr-dev-kit/ndk';
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
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
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
          ndk.addExplicitRelay('wss://purplepag.es', undefined);
          ndk.addExplicitRelay('wss://relay.nostr.band', undefined);
          ndk.addExplicitRelay('wss://relay.snort.social', undefined);
          ndk.addExplicitRelay('wss://relay.highlighter.com', undefined);
          ndk.addExplicitRelay('wss://relay.primal.net', undefined);
          ndk.addExplicitRelay('wss://relay.current.fyi', undefined);
          await ndk.connect(5000);
        } catch {
          console.warn('NDK connection timeout on landing');
        }
      }

      if (!isMounted) return;

      // Subscribe to recent notes (Kind 1)
      const mainSub = ndk.subscribe(
        { kinds: [NDKKind.Text], limit: 100 },
        { closeOnEose: false }
      );

      // Separate subscription for livestreams to ensure we get them
      // We removed strict 'status: live' filter to debug, then check explicitly in callback
      const liveStreamSub = ndk.subscribe(
        [
          { kinds: [30311 as NDKKind], limit: 100 },
          {
            kinds: [30311 as NDKKind],
            authors: ['cf45a6ba1363ad7ed213a078e710d24115ae721c9b47bd1ebf4458eaefb4c2a5'],
            '#d': ['537a365c-f1ec-44ac-af10-22d14a7319fb']
          }
        ],
        { closeOnEose: false }
      );

      // Separate subscription for articles mainly from Highlighter to avoid spam
      const articleSub = ndk.subscribe(
        { kinds: [30023 as NDKKind], limit: 20 },
        { closeOnEose: false, pool: ndk.outboxPool || undefined },
      );

      mainSub.on('event', async (event: NDKEvent) => {
        if (!isMounted) return;

        if (event.kind === NDKKind.Text) {
          setGlobalEvents((prev) => {
            if (prev.find((e) => e.id === event.id)) return prev;
            const newList = [event, ...prev];
            return newList.slice(0, 10);
          });
        }

        // Fetch profile if not already known
        if (event.author) {
          if (event.author.profile) {
            setActiveProfiles((current) => ({
              ...current,
              [event.pubkey]: event.author.profile,
            }));
          }
          event.author.fetchProfile().then((profile) => {
            if (profile && isMounted) {
              setActiveProfiles((current) => ({
                ...current,
                [event.pubkey]: profile,
              }));
            }
          }).catch(() => { });
        }

        setHasLoaded(true);
      });

      liveStreamSub.on('event', async (event: NDKEvent) => {
        if (!isMounted) return;

        const statusTag = event.getMatchingTags('status')[0];
        const status = statusTag ? statusTag[1] : undefined;

        // console.log('Stream found:', event.id, status, event.rawEvent());

        // Allow 'live' or if status is missing/undefined check start time? 
        // For now, keep it somewhat strict but log everything.
        // Some clients capitalization?
        const PINNED_D_TAG = '537a365c-f1ec-44ac-af10-22d14a7319fb';
        const PINNED_PUBKEY = 'cf45a6ba1363ad7ed213a078e710d24115ae721c9b47bd1ebf4458eaefb4c2a5';

        const dTag = event.getMatchingTags('d')[0]?.[1];
        const isPinned = event.pubkey === PINNED_PUBKEY && dTag === PINNED_D_TAG;

        if (status === 'live' || status === 'broadcasting' || isPinned) {
          setLiveStreams((prev) => {
            const newEvent = event;

            // 1. Combine previous and new
            const allEvents = [...prev, newEvent];

            // 2. Sort: Pinned first, then by created_at descending
            allEvents.sort((a, b) => {
              const PINNED_D_TAG = '537a365c-f1ec-44ac-af10-22d14a7319fb';
              const PINNED_PUBKEY = 'cf45a6ba1363ad7ed213a078e710d24115ae721c9b47bd1ebf4458eaefb4c2a5';

              const aD = a.getMatchingTags('d')[0]?.[1];
              const bD = b.getMatchingTags('d')[0]?.[1];

              const aIsPinned = a.pubkey === PINNED_PUBKEY && aD === PINNED_D_TAG;
              const bIsPinned = b.pubkey === PINNED_PUBKEY && bD === PINNED_D_TAG;

              if (aIsPinned && !bIsPinned) return -1;
              if (!aIsPinned && bIsPinned) return 1;

              return (b.created_at || 0) - (a.created_at || 0);
            });

            // 3. Deduplicate by pubkey (keep the first one found)
            const uniqueEvents: NDKEvent[] = [];
            const seenPubkeys = new Set<string>();

            for (const e of allEvents) {
              if (!seenPubkeys.has(e.pubkey)) {
                uniqueEvents.push(e);
                seenPubkeys.add(e.pubkey);
              }
            }

            return uniqueEvents.slice(0, 100);
          });

          // Fetch profile for stream host
          const hostPubkey = event.getMatchingTags('p')[0]?.[1] || event.pubkey;
          if (hostPubkey) {
            const user = ndk.getUser({ pubkey: hostPubkey });
            user.fetchProfile().then((profile) => {
              if (profile && isMounted) {
                setActiveProfiles((current) => ({
                  ...current,
                  [hostPubkey]: profile,
                }));
              }
            }).catch(() => { });
          }
        }
      });

      articleSub.on('event', async (event: NDKEvent) => {
        if (!isMounted) return;
        setArticles((prev) => {
          if (prev.find((e) => e.id === event.id)) return prev;
          // Filter out potential spam/anon if needed validation here
          const newList = [...prev, event].sort(
            (a, b) => (b.created_at || 0) - (a.created_at || 0)
          );
          return newList.slice(0, 10); // increased limit slightly
        });

        // Fetch profile for articles
        if (event.author) {
          event.author.fetchProfile().then((profile) => {
            if (profile && isMounted) {
              setActiveProfiles((current) => ({
                ...current,
                [event.pubkey]: profile,
              }));
            }
          }).catch(() => { });
        }
      });

      subRef.current = { stop: () => { mainSub.stop(); liveStreamSub.stop(); articleSub.stop(); } };
    };

    startSubscription();

    return () => {
      isMounted = false;
      if (subRef.current) subRef.current.stop();
    };
  }, [ndk]);

  // Proactively fetch profiles for visible articles and people
  useEffect(() => {
    if (!ndk) return;

    const pubkeysToFetch = new Set<string>();
    articles.forEach((a) => {
      if (!activeProfiles[a.pubkey]) pubkeysToFetch.add(a.pubkey);
    });
    globalEvents.forEach((e) => {
      if (!activeProfiles[e.pubkey]) pubkeysToFetch.add(e.pubkey);
    });

    if (pubkeysToFetch.size === 0) return;

    const fetchProfiles = async () => {
      const pks = Array.from(pubkeysToFetch);
      // Fetch in chunks to avoid overloading
      for (let i = 0; i < pks.length; i += 10) {
        const chunk = pks.slice(i, i + 10);
        const filter: NDKFilter = { kinds: [0], authors: chunk };
        try {
          const profileEvents = await ndk.fetchEvents(filter);
          profileEvents.forEach((event) => {
            try {
              const profile = JSON.parse(event.content);
              setActiveProfiles((prev) => ({
                ...prev,
                [event.pubkey]: profile,
              }));
            } catch (e) {
              console.warn('Failed to parse profile content', e);
            }
          });
        } catch (err) {
          console.warn('Failed to fetch batch profiles', err);
        }
      }
    };

    const timeout = setTimeout(fetchProfiles, 500);
    return () => clearTimeout(timeout);
  }, [ndk, articles.length, globalEvents.length]);

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
                href="https://shosho.live"
                target="_blank"
                rel="noreferrer"
                className="galaxy-item"
              >
                <img src="https://shosho.live/favicon.ico" alt="" />
                <span>Shosho</span>
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
                <img src="https://primal.net/public/primal-logo-large.png" alt="" style={{ objectFit: 'contain', background: 'white', borderRadius: '4px' }} onError={(e) => (e.currentTarget.src = 'https://primal.net/favicon.ico')} />
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
                    <div className="person-name skeleton skeleton-name"></div>
                    <div className="person-pic">
                      <div className="skeleton skeleton-pic"></div>
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
              {!hasLoaded && (
                <>
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="feed-item">
                      <div className="skeleton skeleton-list-item"></div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="content-box">
            <div className="content-box-header">Livestreams Happening Now [live]</div>
            <div className="live-streams-list">
              <div className="live-streams-list">
                {(() => {
                  const PINNED_D_TAG = '537a365c-f1ec-44ac-af10-22d14a7319fb';
                  const PINNED_PUBKEY = 'cf45a6ba1363ad7ed213a078e710d24115ae721c9b47bd1ebf4458eaefb4c2a5';

                  const sortedStreams = [...liveStreams].sort((a, b) => {
                    const aDTag = a.getMatchingTags('d')[0]?.[1];
                    const bDTag = b.getMatchingTags('d')[0]?.[1];

                    const aIsPinned = a.pubkey === PINNED_PUBKEY && aDTag === PINNED_D_TAG;
                    const bIsPinned = b.pubkey === PINNED_PUBKEY && bDTag === PINNED_D_TAG;

                    if (aIsPinned && !bIsPinned) return -1;
                    if (!aIsPinned && bIsPinned) return 1;

                    const aImage = a.getMatchingTags('image')[0]?.[1];
                    const bImage = b.getMatchingTags('image')[0]?.[1];
                    const aBroken = !aImage || brokenImages.has(a.id);
                    const bBroken = !bImage || brokenImages.has(b.id);

                    if (!aBroken && bBroken) return -1;
                    if (aBroken && !bBroken) return 1;

                    return (b.created_at || 0) - (a.created_at || 0);
                  });

                  if (sortedStreams.length === 0) {
                    // Wireframe placeholder state
                    return [...Array(3)].map((_, i) => (
                      <div key={i} className="stream-item" style={{ pointerEvents: 'none' }}>
                        <div className="stream-thumb">
                          <div className="skeleton" style={{ width: '100%', height: '100%' }}></div>
                        </div>
                        <div className="stream-info">
                          <div className="skeleton" style={{ height: '14px', width: '80%', marginBottom: '4px' }}></div>
                          <div className="skeleton" style={{ height: '12px', width: '50%' }}></div>
                        </div>
                      </div>
                    ));
                  }

                  return sortedStreams.map((stream) => {
                    const title = stream.getMatchingTags('title')[0]?.[1] || 'Untitled Stream';
                    const image = stream.getMatchingTags('image')[0]?.[1];
                    const dTag = stream.getMatchingTags('d')[0]?.[1];
                    const hostPubkey = stream.getMatchingTags('p')[0]?.[1] || stream.pubkey;
                    const url = `/live/${hostPubkey}/${dTag}`;

                    return (
                      <Link
                        key={stream.id}
                        to={url}
                        className="stream-item"
                      >
                        <div className="stream-thumb">
                          {image && !brokenImages.has(stream.id) ? (
                            <img
                              src={image}
                              alt=""
                              onError={() => {
                                setBrokenImages(prev => {
                                  const newSet = new Set(prev);
                                  newSet.add(stream.id);
                                  return newSet;
                                });
                              }}
                            />
                          ) : (
                            <div className="stream-no-image">LIVE</div>
                          )}
                        </div>
                        <div className="stream-info">
                          <div className="stream-title">{title}</div>
                          <div className="stream-host">
                            {activeProfiles[hostPubkey]?.name || activeProfiles[hostPubkey]?.display_name || hostPubkey.slice(0, 8)}
                          </div>
                        </div>
                      </Link>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          <div className="content-box">
            <div className="content-box-header">Recent Articles [read]</div>
            <div className="article-list">
              {articles.map((article) => {
                const title = article.getMatchingTags('title')[0]?.[1] || 'Untitled Article';
                const dTag = article.getMatchingTags('d')[0]?.[1] || '';
                const url = `/blog/${article.pubkey}/${dTag}`;
                const authorProfile = activeProfiles[article.pubkey];

                return (
                  <Link
                    key={article.id}
                    to={url}
                    className="article-item"
                  >
                    <div className="article-title">{title}</div>
                    <div className="article-meta">
                      by <span className="article-author-name">{authorProfile?.name || authorProfile?.displayName || authorProfile?.display_name || authorProfile?.nip05 || article.pubkey.slice(0, 8)}</span>
                    </div>
                  </Link>
                );
              })}
              {articles.length === 0 && (
                <>
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="skeleton skeleton-article"></div>
                  ))}
                </>
              )}
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

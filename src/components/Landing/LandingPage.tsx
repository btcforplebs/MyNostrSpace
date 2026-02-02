import { useState, useEffect } from 'react';
import { useNostr } from '../../context/NostrContext';
import { NDKUser } from '@nostr-dev-kit/ndk';
import './LandingPage.css';

export const LandingPage = () => {
  const { login, loginWithNip46, ndk } = useNostr();
  const [coolPeople, setCoolPeople] = useState<NDKUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [bunkerInput, setBunkerInput] = useState('');
  const [loginMethod, setLoginMethod] = useState<'extension' | 'remote'>('extension');

  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!ndk) return;

    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 5;

    const fetchCoolPeople = async () => {
      console.log(`fetchCoolPeople session: retryCount=${retryCount}, hasLoaded=${hasLoaded}`);
      try {
        // Wait for relays if none are connected yet
        if (ndk.pool.stats().connected === 0) {
          console.log(`No relays connected. Attempting connection...`);
          try {
            await ndk.connect(3000);
          } catch (e) {
            console.warn('ndk.connect failed or timed out during fetchCoolPeople', e);
          }
        }

        console.log(`Requesting recent activity (retry ${retryCount})...`);
        // Fetch recent notes to find active users
        const noteEvents = await Promise.race([
          ndk.fetchEvents({ kinds: [1], limit: 50 }),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout fetching activity')), 15000)
          ),
        ]);

        if ((!noteEvents || noteEvents.size === 0) && retryCount < maxRetries) {
          const delay = Math.min(800 * Math.pow(1.5, retryCount), 4000);
          console.log(
            `No activity found or timeout. Retrying in ${delay}ms... (Attempt ${retryCount + 1}/${maxRetries})`
          );
          retryCount++;
          setTimeout(fetchCoolPeople, delay);
          return;
        }

        if (!isMounted) return;

        if (noteEvents) {
          const pubkeys = Array.from(noteEvents).map((e) => e.pubkey);
          const uniquePubkeys = Array.from(new Set(pubkeys)).slice(0, 15);

          console.log(`Fetching profiles for ${uniquePubkeys.length} active users...`);
          const profileEvents = await ndk.fetchEvents({
            kinds: [0],
            authors: uniquePubkeys,
          });

          const users = uniquePubkeys.map((pk) => {
            const u = ndk.getUser({ pubkey: pk });
            const pEvent = Array.from(profileEvents).find((e) => e.pubkey === pk);
            if (pEvent) {
              try {
                u.profile = JSON.parse(pEvent.content);
              } catch {
                /* ignore */
              }
            }
            return u;
          });

          // Deduplicate by pubkey
          const uniqueUsers = Array.from(new Map(users.map((u) => [u.pubkey, u])).values()).slice(
            0,
            8
          );
          console.log(`Found ${uniqueUsers.length} unique profiles.`);
          setCoolPeople(uniqueUsers);
        }

        setHasLoaded(true);
      } catch (err) {
        console.error('Failed to fetch cool people', err);
        if (isMounted) {
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(fetchCoolPeople, 1000);
          } else {
            setHasLoaded(true); // Finally stop loading
          }
        }
      }
    };

    fetchCoolPeople();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ndk]);

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
      // Optionally set an error state here to show in UI
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-container">
      {/* Header Area */}
      <header className="landing-header">
        <div className="logo-area">
          <h1>mynostrspace</h1>
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
        {/* Left Column */}
        <div className="landing-left">
          <section className="marketing-box">
            <h2>
              mynostrspace.com is an online community that lets you meet your friends' friends.
            </h2>
            <p>
              Create a private community on mynostrspace.com to share photos, journals and interests
              with your growing network of mutual friends!
            </p>
            <p>
              See who knows who, or how you are connected. View your friends' friends, and see how
              you fit into the picture!
            </p>
            <div style={{ marginTop: '20px' }}>
              <button className="signup-large-btn" onClick={() => handleLogin()}>
                Get Started!
              </button>
            </div>
          </section>

          <div className="content-box">
            <div className="content-box-header">Cool New People</div>
            <div className="people-grid">
              {coolPeople.length > 0 ? (
                coolPeople.map((person) => (
                  <div key={person.pubkey} className="person-item">
                    <div className="person-name">
                      {person.profile?.name || person.profile?.display_name || 'Anonymous'}
                    </div>
                    <div className="person-pic">
                      <img
                        src={
                          person.profile?.picture ||
                          `https://robohash.org/${person.pubkey}?set=set4`
                        }
                        alt="User"
                      />
                    </div>
                  </div>
                ))
              ) : hasLoaded ? (
                <div
                  style={{
                    gridColumn: '1/-1',
                    textAlign: 'center',
                    padding: '20px',
                    color: '#666',
                    fontSize: '0.9em',
                  }}
                >
                  No new people found right now.
                </div>
              ) : (
                [...Array(8)].map((_, i) => (
                  <div key={i} className="person-item">
                    <div className="person-name">Loading...</div>
                    <div className="person-pic">
                      <div style={{ width: '90px', height: '90px', backgroundColor: '#eee' }}></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column (Member Login) */}
        <div className="landing-right">
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
                  Remote (NIP-46)
                </button>
              </div>

              <form className="login-form" onSubmit={handleLogin}>
                {loginMethod === 'extension' ? (
                  <>
                    <div className="form-row">
                      <p style={{ fontSize: '0.9em', color: '#666', marginBottom: '10px' }}>
                        Login using a browser extension like Alby or nos2x.
                      </p>
                    </div>
                    <div className="login-actions">
                      <button
                        type="submit"
                        className="login-submit-btn btn-extension"
                        disabled={loading}
                        style={{ width: '100%' }}
                      >
                        {loading ? 'Connecting...' : 'Login with Extension'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-row">
                      <label>Bunker URL:</label>
                      <input
                        type="text"
                        placeholder="bunker://..."
                        value={bunkerInput}
                        onChange={(e) => setBunkerInput(e.target.value)}
                        style={{ width: '100%' }}
                      />
                      <p style={{ fontSize: '0.8em', color: '#888', marginTop: '5px' }}>
                        Paste your NIP-46 connection string here.
                      </p>
                    </div>
                    <div className="login-actions">
                      <button
                        type="submit"
                        className="login-submit-btn btn-remote"
                        disabled={loading}
                        style={{ width: '100%' }}
                      >
                        {loading ? 'Connecting...' : 'Connect to Remote Signer'}
                      </button>
                    </div>
                  </>
                )}

                <div
                  className="login-footer-links"
                  style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '10px' }}
                >
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                    }}
                  >
                    Forgot Password?
                  </a>{' '}
                  <br />
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                    }}
                  >
                    Sign Up
                  </a>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-links">
          <a href="#">About</a> | <a href="#">FAQ</a> | <a href="#">Terms</a> |{' '}
          <a href="#">Privacy</a> | <a href="#">Safety Tips</a> |{' '}
          <a href="#">Contact MyNostrSpace</a> | <a href="#">Report Inappropriate Content</a> |{' '}
          <a href="#">Promote!</a> | <a href="#">Advertise</a>
        </div>
        <div>© 2003-2025 mynostrspace.com. All Rights Reserved.</div>
      </footer>
    </div>
  );
};

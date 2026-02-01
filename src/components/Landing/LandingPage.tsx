import { useState, useEffect } from 'react';
import { useNostr } from '../../context/NostrContext';
import { NDKUser } from '@nostr-dev-kit/ndk';
import './LandingPage.css';

export const LandingPage = () => {
    const { login, ndk } = useNostr();
    const [coolPeople, setCoolPeople] = useState<NDKUser[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!ndk) return;

        const fetchCoolPeople = async () => {
            try {
                // Fetch some recent profiles to show as "Cool New People"
                const events = await ndk.fetchEvents({ kinds: [0], limit: 8 });
                const users = Array.from(events).map(e => {
                    const u = ndk.getUser({ pubkey: e.pubkey });
                    try {
                        u.profile = JSON.parse(e.content);
                    } catch (err) { /* ignore */ }
                    return u;
                });
                setCoolPeople(users);
            } catch (err) {
                console.error("Failed to fetch cool people", err);
            }
        };

        fetchCoolPeople();
    }, [ndk]);

    const handleLogin = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setLoading(true);
        try {
            await login();
        } catch (err) {
            console.error("Login failed", err);
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
                        <div className="powered-by">powered by <span>Nostr</span></div>
                    </div>
                </div>
            </header>

            {/* Blue Nav Bar */}
            <nav className="landing-nav">
                <a href="#">Home</a> | <a href="#">Browse</a> | <a href="#">Search</a> | <a href="#">Invite</a> | <a href="#">Film</a> | <a href="#">Mail</a> | <a href="#">Blog</a> | <a href="#">Favorites</a> | <a href="#">Forum</a> | <a href="#">Groups</a> | <a href="#">Events</a> | <a href="#">Videos</a> | <a href="#">Music</a> | <a href="#">Comedy</a> | <a href="#">Classifieds</a>
            </nav>

            <div className="landing-body">
                {/* Left Column */}
                <div className="landing-left">
                    <section className="marketing-box">
                        <h2>mynostrspace.com is an online community that lets you meet your friends' friends.</h2>
                        <p>Create a private community on mynostrspace.com to share photos, journals and interests with your growing network of mutual friends!</p>
                        <p>See who knows who, or how you are connected. View your friends' friends, and see how you fit into the picture!</p>
                        <div style={{ marginTop: '20px' }}>
                            <button className="signup-large-btn" onClick={() => handleLogin()}>Get Started!</button>
                        </div>
                    </section>

                    <div className="content-box">
                        <div className="content-box-header">Cool New People</div>
                        <div className="people-grid">
                            {coolPeople.length > 0 ? (
                                coolPeople.map((person) => (
                                    <div key={person.pubkey} className="person-item">
                                        <div className="person-name">{person.profile?.name || person.profile?.display_name || 'Anonymous'}</div>
                                        <div className="person-pic">
                                            <img src={person.profile?.picture || `https://robohash.org/${person.pubkey}?set=set4`} alt="User" />
                                        </div>
                                    </div>
                                ))
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
                            <form className="login-form" onSubmit={handleLogin}>
                                <div className="form-row">
                                    <label>E-Mail:</label>
                                    <input type="text" placeholder="Use Nostr Extension" disabled />
                                </div>
                                <div className="form-row">
                                    <label>Password:</label>
                                    <input type="password" disabled />
                                </div>

                                <div className="login-actions">
                                    <div className="remember-check">
                                        <input type="checkbox" id="remember" />
                                        <label htmlFor="remember">Remember Me</label>
                                    </div>
                                    <button type="submit" className="login-submit-btn" disabled={loading}>
                                        {loading ? '...' : 'Login'}
                                    </button>
                                </div>

                                <div className="login-footer-links">
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleLogin(); }}>Forgot Password?</a> <br />
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleLogin(); }}>Sign Up</a>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div className="promo-box" style={{ marginTop: '15px' }}>
                        <h4 style={{ color: '#003399', borderBottom: '1px solid #ccc', paddingBottom: '3px' }}>New to Nostr?</h4>
                        <div style={{ fontSize: '8.5pt', marginBottom: '10px', lineHeight: '1.2' }}>
                            Nostr is a decentralized network. To get started, you'll need a "Key" or an extension like <strong>Alby</strong> or <strong>Amber</strong>.
                        </div>
                        <ul style={{ fontSize: '8.5pt', paddingLeft: '20px', marginBottom: '10px' }}>
                            <li><a href="https://joinnostr.com" target="_blank" rel="noreferrer" style={{ color: '#003399', fontWeight: 'bold' }}>How to Join Nostr</a></li>
                            <li><a href="https://getalby.com" target="_blank" rel="noreferrer" style={{ color: '#003399' }}>Get Alby (Browser)</a></li>
                        </ul>
                        <button className="login-submit-btn" style={{ width: '100%', background: '#ffcc00' }} onClick={() => handleLogin()}>
                            Login with Extension
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="landing-footer">
                <div className="footer-links">
                    <a href="#">About</a> | <a href="#">FAQ</a> | <a href="#">Terms</a> | <a href="#">Privacy</a> | <a href="#">Safety Tips</a> | <a href="#">Contact MyNostrSpace</a> | <a href="#">Report Inappropriate Content</a> | <a href="#">Promote!</a> | <a href="#">Advertise</a>
                </div>
                <div>© 2003-2025 mynostrspace.com. All Rights Reserved.</div>
            </footer>
        </div>
    );
};

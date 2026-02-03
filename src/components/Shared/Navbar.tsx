import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import './Navbar.css';

export const Navbar = () => {
  const { user, logout, login } = useNostr();

  const handleLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (window.nostr) {
      try {
        await login();
      } catch (err) {
        console.error("Navbar login error:", err);
      }
    } else {
      window.location.href = "/#login-section";
    }
  };

  return (
    <div className="navbar-wrapper">
      {/* Header Area (Logo, Search, Auth) */}
      <header className="navbar-header">
        <div className="logo-area">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src="/mynostrspace_logo.png" alt="MyNostrSpace" className="landing-logo" />
              <h1>MyNostrSpace</h1>
            </div>
            <span className="slogan">a place for friends</span>
          </Link>
        </div>

        <div className="header-right">
          <div className="header-links">
            <Link to="/help">Help</Link> |{' '}
            {user ? (
              <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>Sign Out</a>
            ) : (
              // If not logged in, show Sign Up / Login
              // Clicking "Sign Up" or "Login" simply goes to homepage or triggers login
              <>
                <Link to="/" onClick={handleLogin}>Login</Link> | <Link to="/">Sign Up</Link>
              </>
            )}
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
      <nav className="navbar-container">
        <div className="navbar-container-inner">
          <Link to="/">Home</Link> | <Link to="/browse">Browse</Link> | <Link to="/search">Search</Link> |{' '}
          <a href="#" onClick={(e) => e.preventDefault()}>Invite</a> | <Link to="/film">Film</Link> | <a href="#" onClick={(e) => e.preventDefault()}>Mail</a> | <Link to="/blogs">Blog</Link>{' '}
          | <a href="#" onClick={(e) => e.preventDefault()}>Favorites</a> | <a href="#" onClick={(e) => e.preventDefault()}>Forum</a> | <a href="#" onClick={(e) => e.preventDefault()}>Groups</a> |{' '}
          <a href="#" onClick={(e) => e.preventDefault()}>Events</a> | <Link to="/videos">Videos</Link> | <Link to="/music">Music</Link> |{' '}
          <a href="#" onClick={(e) => e.preventDefault()}>Comedy</a> | <Link to="/livestreams">Livestreams</Link>

          {user && (
            <>
              {' '}| <Link to={`/p/${user.pubkey}`}>My Profile</Link>
            </>
          )}
        </div>
      </nav>
    </div>
  );
};

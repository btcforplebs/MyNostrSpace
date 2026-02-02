import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';

export const Navbar = () => {
  const { user, logout } = useNostr();

  // Links trying to mimic the reference image while keeping our functionality
  const leftLinks = [
    { label: 'Home', to: '/' },
    { label: 'Browse', to: '/browse' },
    { label: 'Profile', to: user ? `/p/${user.pubkey}` : '#' },
    { label: 'Friends', to: user ? `/p/${user.pubkey}/friends` : '#' },
  ];

  return (
    <div className="navbar-wrapper">
      {/* Blue Nav Bar */}
      <div className="navbar-container">
        <div className="navbar-inner">
          <div className="navbar-left-links">
            {leftLinks.map((link, index) => (
              <span key={link.label}>
                {index > 0 && ' | '}
                {link.to === '#' ? (
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Coming soon!');
                    }}
                  >
                    {link.label} {index > 0 && index < 3 && '▼'}
                  </a>
                ) : (
                  <Link to={link.to}>
                    {link.label} {index > 0 && index < 3 && '▼'}
                  </Link>
                )}
              </span>
            ))}
          </div>

          <div className="navbar-right">
            {user ? (
              <>
                <Link to="/edit-profile">Edit Profile</Link> | <Link to="/settings">Settings</Link>{' '}
                |{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    logout();
                  }}
                >
                  Sign Out
                </a>
              </>
            ) : (
              <>
                <a href="#">Login</a> | <a href="#">Sign Up</a>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
                .navbar-wrapper {
                    font-family: Arial, Helvetica, sans-serif;
                    width: 100%;
                    max-width: 800px; /* Or 100% depending on layout preference, sticking to container width usually */
                    margin: 0 auto;
                    background: white;
                }
                
                /* Blue Navbar */
                .navbar-container {
                    background-color: #003399; /* The deep blue */
                    padding: 5px 10px;
                    color: white;
                }
                .navbar-inner {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 10pt;
                    font-weight: bold;
                }
                .navbar-inner a {
                    color: white;
                    text-decoration: none;
                    margin: 0 5px;
                }
                .navbar-inner a:hover {
                    text-decoration: underline;
                }
                .navbar-left {
                    display: flex;
                    align-items: center;
                }
                .navbar-right {
                    display: flex;
                    align-items: center;
                }

                @media (max-width: 768px) {
                    .navbar-inner {
                        flex-direction: column;
                        align-items: center;
                        gap: 8px;
                        text-align: center;
                    }
                    .navbar-left-links {
                        display: flex;
                        flex-wrap: wrap;
                        justify-content: center;
                        gap: 4px;
                    }
                    .navbar-right {
                        justify-content: center;
                        font-size: 9pt;
                    }
                }
            `}</style>
    </div>
  );
};

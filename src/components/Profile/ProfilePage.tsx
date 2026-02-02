import { useParams, Link } from 'react-router-dom';
import { useProfile } from '../../hooks/useProfile';
import { useTop8 } from '../../hooks/useTop8';
import { CommentWall } from './CommentWall';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { useExtendedProfile } from '../../hooks/useExtendedProfile';
import { useResolvedPubkey } from '../../hooks/useResolvedPubkey';
import { useNostr } from '../../context/NostrContext';
import { WavlakePlayer } from '../Music/WavlakePlayer';
import { ContactBox } from './ContactBox';
import { Navbar } from '../Shared/Navbar';
import { RichTextRenderer } from '../Shared/RichTextRenderer';
import { SEO } from '../Shared/SEO';
import { useLightbox } from '../../context/LightboxContext';
import './ProfilePage.css';

const ProfilePage = () => {
  const { user } = useNostr();
  const { pubkey: identifier } = useParams<{ pubkey: string }>();
  const { hexPubkey, loading: resolving } = useResolvedPubkey(identifier);
  const { openLightbox } = useLightbox();

  const { profile, loading: profileLoading } = useProfile(hexPubkey || undefined);
  const { top8, loading: top8Loading } = useTop8(hexPubkey || undefined);
  const { layoutCss } = useCustomLayout(hexPubkey || undefined);
  const { data: extendedProfile } = useExtendedProfile(hexPubkey || undefined);

  if (resolving) {
    return (
      <div className="loading-screen">
        <div className="loading-box">
          <div className="loading-header">MyNostrSpace.com</div>
          <div className="loading-body">
            <p>Loading Profile...</p>
            <p style={{ fontSize: '8pt' }}>(Please Wait)</p>
          </div>
        </div>
      </div>
    );
  }

  // Fallback name if profile isn't loaded yet
  const displayName =
    profile?.displayName || profile?.name || (hexPubkey ? `${hexPubkey.slice(0, 8)}...` : 'User');
  const displayAbout =
    profile?.about ||
    (profileLoading ? 'Loading info...' : 'Currently building my brand new NostrSpace page.');

  return (
    <div className="profile-container">
      {layoutCss && <style>{layoutCss}</style>}

      <SEO
        title={displayName}
        description={`${displayName}'s profile on MyNostrSpace. ${profile?.about || ''}`}
        image={profile?.image}
        url={window.location.href}
      />

      {/* Header / Banner Area */}
      <div className="profile-header">
        <Navbar />
      </div>

      <div className="profile-body">
        {/* Left Column: Basic Info */}
        <div className="left-column">
          <div className="profile-pic-box">
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <h1>{displayName}</h1>
              {user?.pubkey === hexPubkey && (
                <Link
                  to="/edit-profile"
                  style={{ fontSize: '8pt', textDecoration: 'none', color: '#003399' }}
                >
                  [ Edit Profile ]
                </Link>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {profile?.image ? (
                <img
                  src={profile.image}
                  alt={profile.name || 'Profile'}
                  className="profile-pic"
                  onClick={() => openLightbox(profile.image!)}
                  style={{ cursor: 'pointer' }}
                />
              ) : (
                <div
                  className="profile-pic"
                  style={{
                    background: '#eee',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ?
                </div>
              )}
              <div className="personal-text" style={{ fontSize: '8pt' }}>
                <RichTextRenderer content={extendedProfile?.headline || '...'} />
                <p>{extendedProfile?.gender}</p>
                <p>
                  {[extendedProfile?.city, extendedProfile?.region, extendedProfile?.country]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
              <div className="last-login" style={{ fontSize: '8pt', margin: '10px 0' }}>
                Last Login: {new Date().toLocaleDateString()}
              </div>
              <div className="mood-box" style={{ fontSize: '8pt' }}>
                View My:{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    alert('Coming soon!');
                  }}
                >
                  Pics
                </a>{' '}
                |{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    alert('Coming soon!');
                  }}
                >
                  Videos
                </a>
              </div>
            </div>
          </div>

          <ContactBox name={profile?.name || ''} pubkey={hexPubkey || ''} />

          <div className="url-box">
            <b>MyNostrSpace URL:</b>
            <br />
            http://mynostrspace.com/p/{profile?.nip05 || profile?.name || hexPubkey?.slice(0, 8)}
          </div>

          <div className="interests-box">
            <h3 className="section-header">{displayName}'s Interests</h3>
            <table className="interests-table myspace-table">
              <tbody>
                <tr>
                  <td className="label">General</td>
                  <td>
                    <RichTextRenderer content={extendedProfile?.interests?.general || 'N/A'} />
                  </td>
                </tr>
                <tr>
                  <td className="label">Music</td>
                  <td>
                    <RichTextRenderer content={extendedProfile?.interests?.music || 'N/A'} />
                  </td>
                </tr>
                <tr>
                  <td className="label">Movies</td>
                  <td>
                    <RichTextRenderer content={extendedProfile?.interests?.movies || 'N/A'} />
                  </td>
                </tr>
                {extendedProfile?.mainClient && (
                  <tr>
                    <td className="label">Client</td>
                    <td>{extendedProfile.mainClient}</td>
                  </tr>
                )}
                {extendedProfile?.bitcoinerSince && (
                  <tr>
                    <td className="label">Bitcoiner Since</td>
                    <td>{extendedProfile.bitcoinerSince}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pass the dynamic music URL or Playlist */}
          {Array.isArray(extendedProfile?.music) ? (
            <WavlakePlayer tracks={extendedProfile.music} />
          ) : (
            <WavlakePlayer trackUrl={extendedProfile?.music?.url} />
          )}
        </div>

        {/* Right Column: The "Dope" Content */}
        <div className="right-column">
          <div
            className="extended-network"
            style={{
              border: '1px solid black',
              padding: '10px',
              marginBottom: '15px',
              background: '#f5f5f5',
            }}
          >
            <h2 style={{ fontSize: '14pt', margin: 0 }}>
              {displayName} is in your extended network
            </h2>
          </div>

          <div className="blurbs-section">
            <h3 className="section-header">{displayName}'s Blurbs</h3>
            <div className="blurb-content" style={{ padding: '10px' }}>
              <h4>About me:</h4>
              <RichTextRenderer content={displayAbout} />

              <h4>Who I'd like to meet:</h4>
              <RichTextRenderer content="Developers building on Nostr and people enjoying freedom." />
            </div>
          </div>

          <div className="top-8-section">
            <h3 className="section-header">{displayName}'s Friend Space</h3>
            <div className="top-8-grid">
              {top8Loading ? (
                <div>Loading Top 8...</div>
              ) : (
                top8.map((friend) => (
                  <div
                    key={friend.pubkey}
                    className="friend-slot"
                    onClick={() => {
                      if (friend.profile?.image) {
                        openLightbox(friend.profile.image);
                      }
                    }}
                    style={{ cursor: friend.profile?.image ? 'pointer' : 'default' }}
                  >
                    <a
                      href={`/p/${friend.profile?.nip05 || friend.profile?.name || friend.pubkey}`}
                    >
                      <p className="friend-name">
                        {friend.profile?.displayName || friend.profile?.name || 'Friend'}
                      </p>
                      <div className="friend-pic-container">
                        {friend.profile?.image ? (
                          <img
                            src={friend.profile.image}
                            alt={friend.profile?.name || 'Friend'}
                            className="friend-pic"
                            style={{
                              width: '90px',
                              height: '90px',
                              objectFit: 'cover',
                              border: '1px solid white',
                            }}
                          />
                        ) : (
                          <div
                            className="friend-pic"
                            style={{ background: '#eee', width: '90px', height: '90px' }}
                          ></div>
                        )}
                      </div>
                    </a>
                  </div>
                ))
              )}
              {/* Fill empty slots if less than 8 */}
              {!top8Loading &&
                top8.length < 8 &&
                [...Array(8 - top8.length)].map((_, i) => (
                  <div key={`empty-${i}`} className="friend-slot empty">
                    <p className="friend-name" style={{ visibility: 'hidden' }}>
                      Top 8
                    </p>
                    <div
                      className="friend-pic-placeholder"
                      style={{ width: '90px', height: '90px' }}
                    ></div>
                  </div>
                ))}
            </div>
            <div
              style={{
                textAlign: 'right',
                marginTop: '10px',
                fontSize: '10pt',
                fontWeight: 'bold',
              }}
            >
              View {displayName}'s Friends: <a href={`/p/${hexPubkey}/friends`}>All</a> |{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  alert('Coming soon!');
                }}
              >
                Online
              </a>{' '}
              |{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  alert('Coming soon!');
                }}
              >
                New
              </a>
            </div>
          </div>

          {/* Comment Wall */}
          <div className="comment-wall-section" style={{ marginTop: '20px' }}>
            <CommentWall pubkey={hexPubkey || ''} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;

import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useProfile } from '../../hooks/useProfile';
import { useTop8 } from '../../hooks/useTop8';
import { CommentWall } from './CommentWall';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { useExtendedProfile } from '../../hooks/useExtendedProfile';
import { useResolvedPubkey } from '../../hooks/useResolvedPubkey';
import { useRelationshipStatus } from '../../hooks/useRelationshipStatus';
import { useNostr } from '../../context/NostrContext';
import { WavlakePlayer } from '../Music/WavlakePlayer';
import { ContactBox } from './ContactBox';
import { Navbar } from '../Shared/Navbar';
import { RichTextRenderer } from '../Shared/RichTextRenderer';
import { SEO } from '../Shared/SEO';
import { useLightbox } from '../../context/LightboxContext';

// Modular Tab Sub-Components
import { ProfileRecipes } from './ProfileRecipes';
import { ProfileBlog } from './ProfileBlog';
import { ProfileFeed } from './ProfileFeed';
import { ProfilePhotos } from './ProfilePhotos';
import { ProfileVideos } from './ProfileVideos';
import { ProfileLivestreams } from './ProfileLivestreams';
import { ProfileBadges } from './ProfileBadges';

import './ProfilePage.css';
import { isBlockedUser } from '../../utils/blockedUsers';
import { AwardBadgeModal } from '../Badges/AwardBadgeModal';
import { useProfileStats } from '../../hooks/useProfileStats';

const ProfilePage = () => {
  const { user, ndk } = useNostr();
  const navigate = useNavigate();
  const { pubkey: identifier } = useParams<{ pubkey: string }>();
  const { hexPubkey, loading: resolving } = useResolvedPubkey(identifier);
  const { openLightbox } = useLightbox();

  const { profile, loading: profileLoading } = useProfile(hexPubkey || '');
  const { top8, loading: top8Loading } = useTop8(hexPubkey || '');
  const { status: relationshipStatus } = useRelationshipStatus(hexPubkey || '');

  const { layoutCss } = useCustomLayout(hexPubkey || '');
  const { data: extendedProfile } = useExtendedProfile(hexPubkey || '');

  // Build a set of blocked pubkeys for stats filtering
  const blockedSet = new Set<string>();
  if (user && hexPubkey) {
    if (isBlockedUser(hexPubkey, blockedSet)) {
      blockedSet.add(hexPubkey);
    }
  }

  const { stats, loadingStats, fetchStats } = useProfileStats(ndk, { pubkey: hexPubkey || '' }, blockedSet);

  // Tab State
  const [activeTab, setActiveTab] = useState('home');
  const [hasPhotos, setHasPhotos] = useState(false);
  const [hasVideos, setHasVideos] = useState(false);
  const [hasRecipes, setHasRecipes] = useState(false);
  const [hasLivestreams, setHasLivestreams] = useState(false);
  const [hasBlog, setHasBlog] = useState(false);
  const [isBadgeCreator, setIsBadgeCreator] = useState(false);
  const [showAwardModal, setShowAwardModal] = useState(false);

  // Content Check Effect - keeping it to show/hide tabs as in 3bd8583
  useEffect(() => {
    if (!ndk || !hexPubkey) return;

    const checkAll = async () => {
      // These are lightweight checks
      const photosCheck = await ndk.fetchEvents({ kinds: [1], authors: [hexPubkey], limit: 20 });
      const hasP = Array.from(photosCheck).some(
        (e) => e.content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif)/i)
      );
      setHasPhotos(hasP);

      const videosCheck = await ndk.fetchEvents({ kinds: [1, 1063], authors: [hexPubkey], limit: 20 });
      const hasV = Array.from(videosCheck).some(
        (e) => e.kind === 1063 || e.content.match(/https?:\/\/[^\s]+\.(mp4|mov|webm|avi|mkv|m3u8)/i)
      );
      setHasVideos(hasV);

      const recipesCheck = await ndk.fetchEvents({
        kinds: [30023 as number],
        authors: [hexPubkey],
        '#t': ['recipe', 'zapcooking', 'nostrcooking'],
        limit: 1,
      });
      setHasRecipes(recipesCheck.size > 0);

      const streamsCheck = await ndk.fetchEvents({
        kinds: [30311 as number],
        authors: [hexPubkey],
        limit: 1,
      });
      setHasLivestreams(streamsCheck.size > 0);

      const blogCheck = await ndk.fetchEvents({
        kinds: [30023 as number],
        authors: [hexPubkey],
        limit: 10,
      });
      const hasB = Array.from(blogCheck).some((e) => {
        const tags = e.tags.map((t) => t[1]);
        return !tags.includes('recipe') && !tags.includes('zapcooking') && !tags.includes('nostrcooking');
      });
      setHasBlog(hasB);

      if (user?.pubkey) {
        const myBadges = await ndk.fetchEvents({
          kinds: [30009 as number],
          authors: [user.pubkey],
          limit: 1,
        });
        setIsBadgeCreator(myBadges.size > 0);
      }
    };

    checkAll();
  }, [ndk, hexPubkey, user?.pubkey]);

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

  if (hexPubkey && isBlockedUser(hexPubkey)) {
    return (
      <div className="profile-container">
        <Navbar />
        <div className="profile-body" style={{ padding: '40px', textAlign: 'center' }}>
          <h2 className="section-header" style={{ background: '#cc0000', color: 'white' }}>
            Profile Blocked
          </h2>
          <p style={{ marginTop: '20px' }}>
            Content from this user has been blocked according to your settings.
          </p>
          <div style={{ marginTop: '20px' }}>
            <Link to="/" style={{ color: '#003399', fontWeight: 'bold' }}>
              &laquo; Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile?.name || profile?.displayName || (hexPubkey ? `${hexPubkey.slice(0, 8)}...` : 'User');
  const displayAbout = profile?.about || (profileLoading ? 'Loading info...' : 'Currently building my brand new NostrSpace page.');

  const tabs = [
    { id: 'home', label: 'Home', visible: true },
    { id: 'notes', label: 'Notes', visible: true },
    { id: 'photos', label: 'Photos', visible: hasPhotos },
    { id: 'videos', label: 'Videos', visible: hasVideos },
    { id: 'recipes', label: 'Recipes', visible: hasRecipes },
    { id: 'livestream', label: 'Livestream', visible: hasLivestreams },
    { id: 'blog', label: 'Blog', visible: hasBlog },
    { id: 'badges', label: 'Badges', visible: true },
  ].filter((t) => t.visible);

  const npub = hexPubkey ? ndk?.getUser({ pubkey: hexPubkey }).npub : '';

  return (
    <div className="profile-container">
      {layoutCss && <style>{layoutCss}</style>}

      <SEO
        title={displayName}
        description={`${displayName}'s profile on MyNostrSpace. ${profile?.about || ''}`}
        image={profile?.picture}
        url={window.location.href}
      />

      <div className="profile-header">
        <Navbar />
      </div>

      <div className="profile-body">
        {/* Left Column */}
        <div className="left-column">
          <div className="profile-pic-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {displayName}
                {profile?.nip05 && <span title={profile.nip05} style={{ color: '#0099ff', fontSize: '0.6em', verticalAlign: 'middle' }}>✓</span>}
              </h1>
              <div style={{ display: 'flex', gap: '8px' }}>
                {user?.pubkey === hexPubkey && (
                  <Link to="/edit-profile" style={{ fontSize: '8pt', textDecoration: 'none', color: '#003399' }}>[ Edit Profile ]</Link>
                )}
              </div>
            </div>

            <div className="profile-details-grid">
              {profile?.picture ? (
                <img
                  src={profile.picture}
                  alt={profile.name || 'Profile'}
                  className="profile-pic"
                  onClick={() => openLightbox(profile.picture!)}
                  style={{ cursor: 'pointer', width: '170px' }}
                />
              ) : (
                <div className="profile-pic" style={{ background: '#eee', display: 'flex', alignItems: 'center', justifyItems: 'center', width: '170px', height: '170px' }}>?</div>
              )}

              <div className="profile-text-details">
                <div className="personal-text" style={{ fontSize: '8pt' }}>
                  <RichTextRenderer content={extendedProfile?.headline || '...'} />
                  <p>{extendedProfile?.gender}</p>
                  <p>{[extendedProfile?.city, extendedProfile?.region, extendedProfile?.country].filter(Boolean).join(', ')}</p>
                </div>
                {profile?.nip05 && (
                  <div className="nip05" style={{ fontSize: '8pt', color: '#666', fontWeight: 'bold' }}>{profile.nip05}</div>
                )}
                <div className="last-login" style={{ fontSize: '8pt', margin: '10px 0' }}>
                  Last Login: {new Date().toLocaleDateString()}
                </div>
                <div
                  className="user-stats-clickable"
                  style={{ fontSize: '8pt', marginTop: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                  onClick={fetchStats}
                  title="Click to load stats"
                >
                  {loadingStats ? (
                    <span>Loading stats...</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span>Followers: {stats.followers ?? '0'}</span>
                      <span>Posts: {stats.posts ?? '0'}</span>
                      <span>Zaps Received: {stats.zaps ?? '0'} 丰</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <ContactBox
            name={profile?.name || ''}
            pubkey={hexPubkey || ''}
            showAwardButton={isBadgeCreator && user?.pubkey !== hexPubkey}
            onAwardBadge={() => setShowAwardModal(true)}
          />

          <div className="profile-box">
            <h3 className="section-header">My Apps</h3>
            <div className="profile-box-body">
              <ul className="my-apps-list">
                <li className="app-item" onClick={() => navigate('/blogs')}><span className="app-icon">✍️</span> Blogs</li>
                <li className="app-item" onClick={() => navigate('/videos')}><span className="app-icon">🎥</span> Videos</li>
                <li className="app-item" onClick={() => navigate('/music')}><span className="app-icon">🎵</span> Music</li>
                <li className="app-item" onClick={() => navigate('/recipes')}><span className="app-icon">🍳</span> Recipes</li>
                <li className="app-item" onClick={() => navigate('/livestreams')}><span className="app-icon">📺</span> Live</li>
                <li className="app-item" onClick={() => navigate('/badges')}><span className="app-icon">🏆</span> Badges</li>
                <li className="app-item" onClick={() => navigate('/marketplace')}><span className="app-icon">🛒</span> Shop</li>
                <li className="app-item" onClick={() => navigate('/photos')}><span className="app-icon">🖼️</span> Photos</li>
              </ul>
            </div>
          </div>

          <div className="url-box">
            <b>MyNostrSpace URL:</b><br />
            http://mynostrspace.com/p/{npub || hexPubkey}
          </div>

          <div className="interests-box">
            <h3 className="section-header">{displayName}'s Interests</h3>
            <table className="interests-table myspace-table">
              <tbody>
                <tr>
                  <td className="label">General</td>
                  <td><RichTextRenderer content={extendedProfile?.interests?.general || 'N/A'} /></td>
                </tr>
                <tr>
                  <td className="label">Music</td>
                  <td><RichTextRenderer content={extendedProfile?.interests?.music || 'N/A'} /></td>
                </tr>
                <tr>
                  <td className="label">Movies</td>
                  <td><RichTextRenderer content={extendedProfile?.interests?.movies || 'N/A'} /></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="badges-box">
            <h3 className="section-header">Badges</h3>
            <ProfileBadges ndk={ndk} pubkey={hexPubkey || ''} userNpub={user?.npub} />
          </div>

          {extendedProfile?.music && (
            Array.isArray(extendedProfile.music) ? (
              <WavlakePlayer tracks={extendedProfile.music} />
            ) : (
              <WavlakePlayer trackUrl={extendedProfile?.music?.url} />
            )
          )}
        </div>

        {/* Right Column */}
        <div className="right-column">
          <div className="extended-network" style={{ border: '1px solid black', padding: '10px', marginBottom: '15px', background: '#f5f5f5' }}>
            <h2 style={{ fontSize: '14pt', margin: 0 }}>
              {displayName} {relationshipStatus || 'is in your extended network'}
            </h2>
          </div>

          <div className="profile-tabs" style={{ marginBottom: '0', display: 'flex', gap: '0' }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '5px 12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '9pt',
                  backgroundColor: activeTab === tab.id ? 'var(--myspace-orange)' : '#eee',
                  color: activeTab === tab.id ? 'white' : '#333',
                  border: '1px solid #ccc',
                  borderBottom: 'none',
                  borderRadius: '5px 5px 0 0',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="profile-tab-content-container" style={{ border: '1px solid #ccc', borderTop: 'none', background: 'white' }}>
            {activeTab === 'home' && (
              <>
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
                        <div key={friend.pubkey} className="friend-slot">
                          <Link to={`/p/${friend.npub || friend.pubkey}`}>
                            <p className="friend-name">{friend.profile?.displayName || friend.profile?.name || 'Friend'}</p>
                            <div className="friend-pic-container">
                              {friend.profile?.image ? (
                                <img
                                  src={friend.profile.image}
                                  alt={friend.profile?.name || 'Friend'}
                                  className="friend-pic"
                                  style={{ width: '90px', height: '90px', objectFit: 'cover', border: '1px solid white' }}
                                />
                              ) : (
                                <div className="friend-pic" style={{ background: '#eee', width: '90px', height: '90px' }}></div>
                              )}
                            </div>
                          </Link>
                        </div>
                      ))
                    )}
                    {!top8Loading && top8.length < 8 && [...Array(8 - top8.length)].map((_, i) => (
                      <div key={`empty-${i}`} className="friend-slot empty">
                        <p className="friend-name" style={{ visibility: 'hidden' }}>Top 8</p>
                        <div className="friend-pic-placeholder" style={{ width: '90px', height: '90px' }}></div>
                      </div>
                    ))}
                  </div>
                  <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '10pt', fontWeight: 'bold' }}>
                    View {displayName}'s Friends: <Link to={`/p/${hexPubkey}/friends`}>All</Link>
                  </div>
                </div>

                <div className="comment-wall-section" style={{ marginTop: '20px' }}>
                  <CommentWall pubkey={hexPubkey || ''} />
                </div>

                <ProfileFeed ndk={ndk} pubkey={hexPubkey || ''} />
              </>
            )}

            {activeTab === 'notes' && (
              <div className="profile-section-tab" style={{ padding: '10px' }}>
                <ProfileFeed ndk={ndk} pubkey={hexPubkey || ''} />
              </div>
            )}

            {activeTab === 'photos' && (
              <div className="profile-section-tab" style={{ padding: '10px' }}>
                <h3 className="section-header">{displayName}'s Photos</h3>
                <ProfilePhotos ndk={ndk} pubkey={hexPubkey || ''} />
              </div>
            )}

            {activeTab === 'videos' && (
              <div className="profile-section-tab" style={{ padding: '10px' }}>
                <h3 className="section-header">{displayName}'s Videos</h3>
                <ProfileVideos ndk={ndk} pubkey={hexPubkey || ''} />
              </div>
            )}

            {activeTab === 'recipes' && (
              <div className="profile-section-tab" style={{ padding: '10px' }}>
                <h3 className="section-header">{displayName}'s Recipes</h3>
                <ProfileRecipes ndk={ndk} pubkey={hexPubkey || ''} />
              </div>
            )}

            {activeTab === 'livestream' && (
              <div className="profile-section-tab" style={{ padding: '10px' }}>
                <h3 className="section-header">{displayName}'s Livestreams</h3>
                <ProfileLivestreams ndk={ndk} pubkey={hexPubkey || ''} />
              </div>
            )}

            {activeTab === 'blog' && (
              <div className="profile-section-tab" style={{ padding: '10px' }}>
                <h3 className="section-header">{displayName}'s Blog Posts</h3>
                <ProfileBlog ndk={ndk} pubkey={hexPubkey || ''} />
              </div>
            )}

            {activeTab === 'badges' && (
              <div className="profile-section-tab" style={{ padding: '10px' }}>
                <ProfileBadges ndk={ndk} pubkey={hexPubkey || ''} userNpub={user?.npub} />
              </div>
            )}
          </div>
        </div>
      </div>

      {showAwardModal && hexPubkey && (
        <AwardBadgeModal
          recipientPubkey={hexPubkey}
          onClose={() => setShowAwardModal(false)}
          onSuccess={() => { }}
        />
      )}
    </div>
  );
};

export default ProfilePage;

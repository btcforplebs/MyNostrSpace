import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
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
import { type NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import './ProfilePage.css';
import { filterRelays } from '../../utils/relay';

const ProfilePage = () => {
  const { user, ndk } = useNostr();
  const { pubkey: identifier } = useParams<{ pubkey: string }>();
  const { hexPubkey, loading: resolving } = useResolvedPubkey(identifier);
  const { openLightbox } = useLightbox();

  const { profile, loading: profileLoading } = useProfile(hexPubkey || undefined);
  const { top8, loading: top8Loading } = useTop8(hexPubkey || undefined);

  const userObj = hexPubkey ? ndk?.getUser({ pubkey: hexPubkey }) : null;
  const npub = userObj?.npub;

  const { layoutCss } = useCustomLayout(hexPubkey || undefined);
  const { data: extendedProfile } = useExtendedProfile(hexPubkey || undefined);

  const [stats, setStats] = useState<{
    followers: number | null;
    posts: number | null;
    zaps: number | null;
  }>({
    followers: null,
    posts: null,
    zaps: null,
  });
  const [loadingStats, setLoadingStats] = useState(false);

  const fetchStats = async () => {
    if (loadingStats || !ndk || !hexPubkey) return;
    setLoadingStats(true);

    // Reset stats to 0 to start counting up
    setStats({ followers: 0, posts: 0, zaps: 0 });

    try {
      // 1. Get User's Preferred Relays (Kind 10002)
      const relayEvent = await ndk.fetchEvent({ kinds: [10002], authors: [hexPubkey] });
      const relayUrls = relayEvent
        ? relayEvent.tags.filter((t) => t[0] === 'r').map((t) => t[1])
        : [];

      const targetRelays =
        relayUrls.length > 0 ? NDKRelaySet.fromRelayUrls(filterRelays(relayUrls), ndk) : undefined;

      // 2. Start Subscriptions (Streaming)
      const subOptions = { closeOnEose: true, relaySet: targetRelays };

      const followersSub = ndk.subscribe({ kinds: [3], '#p': [hexPubkey] }, subOptions);
      const postsSub = ndk.subscribe({ kinds: [1], authors: [hexPubkey] }, subOptions);
      const zapsSub = ndk.subscribe({ kinds: [9735], '#p': [hexPubkey] }, subOptions);

      followersSub.on('event', () => {
        setStats((prev) => ({ ...prev, followers: (prev.followers || 0) + 1 }));
      });

      postsSub.on('event', (ev: NDKEvent) => {
        if (!ev.tags.some((t) => t[0] === 'e')) {
          setStats((prev) => ({ ...prev, posts: (prev.posts || 0) + 1 }));
        }
      });

      zapsSub.on('event', (ev: NDKEvent) => {
        let amt = 0;
        const amountTag = ev.tags.find((t) => t[0] === 'amount');
        if (amountTag) {
          amt = parseInt(amountTag[1]) / 1000;
        } else {
          const bolt11 = ev.tags.find((t) => t[0] === 'bolt11')?.[1];
          if (bolt11) {
            const match = bolt11.match(/lnbc(\d+)([pnum])1/);
            if (match) {
              let val = parseInt(match[1]);
              const multiplier = match[2];
              if (multiplier === 'm') val *= 100000;
              else if (multiplier === 'u') val *= 100;
              else if (multiplier === 'n') val *= 0.1;
              else if (multiplier === 'p') val *= 0.0001;
              amt = val;
            }
          }
        }
        if (amt > 0) {
          setStats((prev) => ({ ...prev, zaps: Math.floor((prev.zaps || 0) + amt) }));
        }
      });

      let finishedCount = 0;
      const onDone = () => {
        finishedCount++;
        if (finishedCount >= 3) setLoadingStats(false);
      };

      followersSub.on('eose', onDone);
      postsSub.on('eose', onDone);
      zapsSub.on('eose', onDone);

      // Safety timeout
      setTimeout(() => setLoadingStats(false), 20000);
    } catch (e) {
      console.error('Error starting stats stream:', e);
      setLoadingStats(false);
    }
  };

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
            <div className="profile-details-grid">
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
              <div className="profile-text-details">
                <div className="personal-text" style={{ fontSize: '8pt' }}>
                  <RichTextRenderer content={extendedProfile?.headline || '...'} />
                  <p>{extendedProfile?.gender}</p>
                  <p>
                    {[extendedProfile?.city, extendedProfile?.region, extendedProfile?.country]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
                {profile?.nip05 && (
                  <div
                    className="nip05"
                    style={{ fontSize: '8pt', color: '#666', fontWeight: 'bold' }}
                  >
                    {profile.nip05}
                  </div>
                )}
                <div className="last-login" style={{ fontSize: '8pt', margin: '10px 0' }}>
                  Last Login: {new Date().toLocaleDateString()}
                </div>
                <div
                  className="user-stats-clickable"
                  style={{
                    fontSize: '8pt',
                    marginTop: '5px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                  onClick={fetchStats}
                  title="Click to load stats"
                >
                  {loadingStats ? (
                    <span>Loading stats...</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span>Followers: {stats.followers ?? '∞'}</span>
                      <span>Posts: {stats.posts ?? '∞'}</span>
                      <span>Zaps Received: {stats.zaps ?? '∞'} 丰</span>
                    </div>
                  )}
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
          </div>

          <ContactBox name={profile?.name || ''} pubkey={hexPubkey || ''} />

          <div className="url-box">
            <b>MyNostrSpace URL:</b>
            <br />
            http://mynostrspace.com/p/{npub || hexPubkey}
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
                  <div key={friend.pubkey} className="friend-slot" style={{ cursor: 'default' }}>
                    <a href={`/p/${friend.npub}`}>
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

import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useProfile } from '../../hooks/useProfile';
import { useTop8 } from '../../hooks/useTop8';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import { Avatar } from '../Shared/Avatar';
import { SEO } from '../Shared/SEO';
import { isBlockedUser } from '../../utils/blockedUsers';
import { PRIMAL_BOT_PUBKEY } from '../../utils/antiprimal';
import { useProfileStats } from '../../hooks/useProfileStats';

// Tab Sub-Components
import { ProfileRecipes } from './ProfileRecipes';
import { ProfileBlog } from './ProfileBlog';
import { ProfileFeed } from './ProfileFeed';
import { ProfilePhotos } from './ProfilePhotos';
import { ProfileVideos } from './ProfileVideos';
import { ProfileLivestreams } from './ProfileLivestreams';
import { ProfileBadges } from './ProfileBadges';

import './ProfilePage.css';

const ProfilePage = () => {
  const { pubkey } = useParams<{ pubkey: string }>();
  const navigate = useNavigate();
  const { profile, loading: profileLoading } = useProfile(pubkey);
  const {
    top8,
    loading: top8Loading,
  } = useTop8(pubkey || '');

  const { layoutCss } = useCustomLayout(pubkey);
  const { user, ndk } = useNostr();
  const [activeTab, setActiveTab] = useState<'feed' | 'blog' | 'media' | 'recipes' | 'live' | 'badges'>('feed');

  // Build a set of blocked pubkeys for stats filtering
  const blockedSet = new Set<string>();
  if (user) {
    // isBlockedUser is synchronous
    if (isBlockedUser(pubkey || '', blockedSet)) {
      blockedSet.add(pubkey || '');
    }
  }

  const { stats, loadingStats } = useProfileStats(ndk, { pubkey: pubkey || '' }, blockedSet);

  // Follow/unfollow state – fetch the user's kind 3 contacts list
  const [contactListEvent, setContactListEvent] = useState<NDKEvent | null>(null);

  const fetchContactList = useCallback(async () => {
    if (!ndk || !user) return;
    try {
      const ev = await ndk.fetchEvent({
        kinds: [3],
        authors: [user.pubkey],
      });
      setContactListEvent(ev);
    } catch {
      // ignore
    }
  }, [ndk, user]);

  useEffect(() => {
    fetchContactList();
  }, [fetchContactList]);

  if (!pubkey) {
    return <div>No profile specified.</div>;
  }

  const isMyProfile = user?.pubkey === pubkey;
  const isBlocked = isBlockedUser(pubkey, blockedSet);

  const isFollowing = contactListEvent?.tags.some(
    (t: string[]) => t[0] === 'p' && t[1] === pubkey
  ) || false;

  const handleFollowToggle = async () => {
    if (!ndk || !user) {
      alert('Please login to follow/unfollow users.');
      return;
    }
    try {
      if (!isFollowing) {
        const followEvent = new NDKEvent(ndk);
        followEvent.kind = 3;
        followEvent.tags = [['p', pubkey]];
        if (contactListEvent) {
          followEvent.tags = [
            ...contactListEvent.tags.filter((t: string[]) => t[0] === 'p'),
            ['p', pubkey],
          ];
        }
        await followEvent.publish();
        window.location.reload();
      } else {
        const unFollowEvent = new NDKEvent(ndk);
        unFollowEvent.kind = 3;
        if (contactListEvent) {
          unFollowEvent.tags = contactListEvent.tags.filter(
            (t: string[]) => t[0] === 'p' && t[1] !== pubkey
          );
        }
        await unFollowEvent.publish();
        window.location.reload();
      }
    } catch (e) {
      console.error('Failed to update follow list:', e);
      alert('Failed to update follow list. Please try again.');
    }
  };

  const handleStartChat = () => {
    navigate(`/chat?p=${pubkey}`);
  };

  const displayName = profile?.name || profile?.displayName || pubkey.slice(0, 8);

  return (
    <div className="profile-page-container">
      {layoutCss && <style>{layoutCss}</style>}
      <SEO
        title={displayName}
        description={profile?.about || 'View my profile on MyNostrSpace.'}
        image={profile?.picture}
      />
      <Navbar />

      <div className="profile-wrapper">
        <div className="profile-content">
          <div className="profile-header-top">
            <h1 className="profile-title">{displayName}'s Space</h1>
            {isMyProfile && (
              <Link to="/edit-layout" className="page-themes-link">
                <div className="theme-icon"></div>
                Edit Theme
              </Link>
            )}
          </div>
          <div className="profile-header-sub">
            <div className="my-url-text">
              URL: http://mynostrspace.com/p/{profile?.nip05 || pubkey.slice(0, 16)}
            </div>
            {isMyProfile && (
              <Link to="/edit-profile" className="edit-profile-link">
                Edit Profile
              </Link>
            )}
            {!isMyProfile && !isBlocked && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleStartChat}
                  style={{
                    padding: '4px 12px',
                    backgroundColor: '#1E90FF',
                    color: 'white',
                    border: '1px solid #104E8B',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '12px',
                  }}
                >
                  Message
                </button>
                <button
                  onClick={handleFollowToggle}
                  className="edit-profile-link"
                  style={{
                    backgroundColor: isFollowing ? '#f0f0f0' : '#ff9933',
                    color: isFollowing ? '#333' : 'white',
                    borderColor: isFollowing ? '#ccc' : '#cc7a29',
                  }}
                >
                  {isFollowing ? 'Unfollow' : 'Follow'}
                </button>
              </div>
            )}
            {!isMyProfile && isBlocked && (
              <div style={{ color: 'red', fontWeight: 'bold' }}>User is Blocked</div>
            )}
          </div>

          <div className="profile-layout">
            {/* Left Sidebar */}
            <div className="profile-left">
              <div className="profile-box user-pic-box">
                <div className="profile-box-header">{displayName}</div>
                <div className="profile-box-body">
                  <div className="user-pic-container">
                    {profile?.picture ? (
                      <Avatar pubkey={pubkey} src={profile.picture} size={170} className="user-pic" />
                    ) : (
                      <div className="user-pic-placeholder">No Picture</div>
                    )}
                  </div>

                  {!loadingStats ? (
                    <div className="stats-container">
                      <div className="stat-item">
                        <span className="stat-label">Followers</span>
                        <span className="stat-value">{stats.followers ?? 'N/A'}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Posts</span>
                        <span className="stat-value">{stats.posts ?? 'N/A'}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Zaps Recv</span>
                        <span className="stat-value">{stats.zaps ?? 'N/A'} 丰</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', textAlign: 'center', marginTop: '10px' }}>
                      Loading Stats...
                    </div>
                  )}

                  {pubkey === PRIMAL_BOT_PUBKEY && (
                    <div style={{ marginTop: '10px', textAlign: 'center' }}>
                      <button
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          backgroundColor: '#eee',
                          border: '1px solid #ccc',
                          borderRadius: '4px',
                        }}
                      >
                        Force Sync Primal Stats
                      </button>
                    </div>
                  )}

                  <div className="user-bio">{profile?.about || 'No bio provided.'}</div>

                  {profileLoading ? (
                    <div style={{ fontSize: '12px' }}>Loading profile data...</div>
                  ) : null}
                </div>
              </div>

              {/* Friends List Component */}
              <div className="profile-box friends-box">
                <div className="profile-box-header">
                  {displayName}'s Friends Space ({top8Loading ? '...' : top8.length})
                </div>
                <div className="profile-box-body">
                  {top8Loading ? (
                    <div className="loading-friends">Loading friends...</div>
                  ) : top8.length === 0 ? (
                    <div className="no-friends">No friends found.</div>
                  ) : (
                    <div className="friends-grid">
                      {top8.map((friend) => (
                        <Link
                          to={`/p/${friend.pubkey}`}
                          key={friend.pubkey}
                          className="friend-tile"
                        >
                          <Avatar
                            pubkey={friend.pubkey}
                            src={friend.profile?.image}
                            size={70}
                            className="friend-avatar"
                          />
                          <div className="friend-name">
                            {friend.profile?.name ||
                              friend.profile?.displayName ||
                              friend.pubkey.slice(0, 8)}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  <div style={{ textAlign: 'right', marginTop: '10px' }}>
                    <Link to={`/friends/${pubkey}`} className="view-all-friends">
                      View All
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="profile-main">
              {profile?.banner && (
                <div
                  className="profile-banner-container"
                  style={{
                    width: '100%',
                    height: '250px',
                    marginBottom: '15px',
                    border: '1px solid #6699cc',
                    background: '#000',
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={profile.banner}
                    alt="Banner"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              )}

              <div className="view-mode-tabs profile-tabs">
                <button
                  className={activeTab === 'feed' ? 'active' : ''}
                  onClick={() => setActiveTab('feed')}
                >
                  Feed
                </button>
                <button
                  className={activeTab === 'media' ? 'active' : ''}
                  onClick={() => setActiveTab('media')}
                >
                  Media
                </button>
                <button
                  className={activeTab === 'blog' ? 'active' : ''}
                  onClick={() => setActiveTab('blog')}
                >
                  Blog
                </button>
                <button
                  className={activeTab === 'recipes' ? 'active' : ''}
                  onClick={() => setActiveTab('recipes')}
                >
                  Recipes
                </button>
                <button
                  className={activeTab === 'live' ? 'active' : ''}
                  onClick={() => setActiveTab('live')}
                >
                  Live
                </button>
                <button
                  className={activeTab === 'badges' ? 'active' : ''}
                  onClick={() => setActiveTab('badges')}
                >
                  Badges
                </button>
              </div>

              <div
                className="profile-tab-content"
                style={{
                  background: 'white',
                  border: '1px solid #6699cc',
                  borderTop: 'none',
                  minHeight: '400px',
                }}
              >
                {activeTab === 'feed' && <ProfileFeed ndk={ndk} pubkey={pubkey} />}

                {activeTab === 'media' && (
                  <div>
                    <h3 style={{ margin: '15px 15px 5px', color: '#6699cc' }}>Photos</h3>
                    <ProfilePhotos ndk={ndk} pubkey={pubkey} />
                    <h3 style={{ margin: '15px 15px 5px', color: '#6699cc' }}>Videos</h3>
                    <ProfileVideos ndk={ndk} pubkey={pubkey} />
                  </div>
                )}

                {activeTab === 'blog' && <ProfileBlog ndk={ndk} pubkey={pubkey} />}

                {activeTab === 'recipes' && <ProfileRecipes ndk={ndk} pubkey={pubkey} />}

                {activeTab === 'live' && <ProfileLivestreams ndk={ndk} pubkey={pubkey} />}

                {activeTab === 'badges' && <ProfileBadges ndk={ndk} pubkey={pubkey} userNpub={user?.npub} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;

import { useParams, Link } from 'react-router-dom';
import { useFriends } from '../../hooks/useFriends';
import { useProfile } from '../../hooks/useProfile';
import { Navbar } from '../Shared/Navbar';
import { useEffect, useState } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { useResolvedPubkey } from '../../hooks/useResolvedPubkey';

const PAGE_SIZE = 100;

const FriendsPage = () => {
  const { pubkey: identifier } = useParams<{ pubkey: string }>();
  const { hexPubkey, loading: resolving } = useResolvedPubkey(identifier);
  const {
    friends: friendPubkeys,
    loading: friendsLoading,
    fetchProfiles,
  } = useFriends(hexPubkey || undefined);
  const { profile } = useProfile(hexPubkey || undefined);

  const [currentPage, setCurrentPage] = useState(0);
  const [currentProfiles, setCurrentProfiles] = useState<NDKUser[]>([]);
  const [pageLoading, setPageLoading] = useState(false);

  const totalPages = Math.ceil(friendPubkeys.length / PAGE_SIZE);

  useEffect(() => {
    const loadPage = async () => {
      if (friendPubkeys.length === 0) return;
      setPageLoading(true);
      const start = currentPage * PAGE_SIZE;
      const end = start + PAGE_SIZE;
      const slice = friendPubkeys.slice(start, end);
      if (fetchProfiles) {
        const profiles = await fetchProfiles(slice);
        setCurrentProfiles(profiles);
      }
      setPageLoading(false);
    };
    loadPage();
  }, [friendPubkeys, currentPage, fetchProfiles]);

  if (resolving || friendsLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-box">
          <div className="loading-header">MyNostrSpace.com</div>
          <div className="loading-body">
            <p>Loading Contact List...</p>
            <p style={{ fontSize: '8pt' }}>(Please Wait)</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', background: 'white' }}>
      <Navbar />

      <div style={{ padding: 20 }}>
        <div style={{ borderBottom: '1px solid #000', marginBottom: 15, paddingBottom: 5 }}>
          <h2 style={{ margin: 0 }}>
            {profile?.name || 'User'}'s Friends
            <span style={{ fontSize: '12pt', fontWeight: 'normal', marginLeft: 10 }}>
              ({friendPubkeys.length})
            </span>
          </h2>
          <div style={{ marginTop: 5 }}>
            <Link to={`/p/${hexPubkey}`}>&laquo; Back to Profile</Link>
          </div>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="pagination" style={{ margin: '10px 0', textAlign: 'right' }}>
            Page {currentPage + 1} of {totalPages}{' '}
            <button disabled={currentPage === 0} onClick={() => setCurrentPage((p) => p - 1)}>
              &laquo; Prev
            </button>{' '}
            <button
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next &raquo;
            </button>
          </div>
        )}

        {pageLoading ? (
          <div>Loading profiles for page {currentPage + 1}...</div>
        ) : (
          <div className="friends-grid">
            {currentProfiles.map((friend) => (
              <div
                key={friend.pubkey}
                className="friend-card"
                style={{
                  width: 100,
                  textAlign: 'center',
                  marginBottom: 20,
                  fontSize: '10pt',
                }}
              >
                <div style={{ marginBottom: 5 }}>
                  <Link
                    to={`/p/${friend.profile?.nip05 || friend.profile?.name || friend.pubkey}`}
                    style={{ fontWeight: 'bold', textDecoration: 'none' }}
                  >
                    {friend.profile?.displayName || friend.profile?.name || 'Friend'}
                  </Link>
                </div>
                <Link to={`/p/${friend.profile?.nip05 || friend.profile?.name || friend.pubkey}`}>
                  <img
                    src={friend.profile?.image || 'https://via.placeholder.com/80'}
                    alt="Friend"
                    style={{ width: 80, height: 80, objectFit: 'cover', border: '1px solid #ccc' }}
                  />
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Bottom Pagination Controls */}
        {totalPages > 1 && (
          <div className="pagination" style={{ margin: '20px 0', textAlign: 'right' }}>
            Page {currentPage + 1} of {totalPages}{' '}
            <button disabled={currentPage === 0} onClick={() => setCurrentPage((p) => p - 1)}>
              &laquo; Prev
            </button>{' '}
            <button
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next &raquo;
            </button>
          </div>
        )}
      </div>

      <style>{`
                .friends-grid {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 15px;
                }
                .friend-card:hover {
                    background-color: #f0f0f0;
                }
            `}</style>
    </div>
  );
};

export default FriendsPage;

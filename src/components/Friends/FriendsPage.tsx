import { useParams, Link } from 'react-router-dom';
import { useFriends } from '../../hooks/useFriends';
import { useProfile } from '../../hooks/useProfile';
import { Navbar } from '../Shared/Navbar';
import { useEffect, useState } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { useResolvedPubkey } from '../../hooks/useResolvedPubkey';
import { Avatar } from '../Shared/Avatar';

const PAGE_SIZE = 24; // Smaller batch for faster loading

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

  const displayName = profile?.name || profile?.displayName || 'User';

  return (
    <div className="friends-page-container">
      <Navbar />

      <div className="friends-page-content">
        <div className="friends-page-header">
          <h2>
            {displayName}'s Friends
            <span className="friend-count">({friendPubkeys.length})</span>
          </h2>
          <Link to={`/p/${hexPubkey}`} className="back-link">
            &laquo; Back to Profile
          </Link>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="pagination-controls">
            <span className="page-info">
              Page {currentPage + 1} of {totalPages}
            </span>
            <div className="pagination-buttons">
              <button
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="pagination-btn"
              >
                &laquo; Prev
              </button>
              <button
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="pagination-btn"
              >
                Next &raquo;
              </button>
            </div>
          </div>
        )}

        {pageLoading ? (
          <div className="friends-grid">
            {/* Loading skeletons */}
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="friend-card skeleton">
                <div className="skeleton-avatar"></div>
                <div className="skeleton-name"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="friends-grid">
            {currentProfiles.map((friend) => (
              <Link key={friend.pubkey} to={`/p/${friend.npub}`} className="friend-card">
                <Avatar
                  pubkey={friend.pubkey}
                  src={friend.profile?.image}
                  size={70}
                  className="friend-avatar"
                />
                <div className="friend-name">
                  {friend.profile?.displayName || friend.profile?.name || 'Friend'}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Bottom Pagination Controls */}
        {totalPages > 1 && !pageLoading && (
          <div className="pagination-controls bottom">
            <span className="page-info">
              Page {currentPage + 1} of {totalPages}
            </span>
            <div className="pagination-buttons">
              <button
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="pagination-btn"
              >
                &laquo; Prev
              </button>
              <button
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="pagination-btn"
              >
                Next &raquo;
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .friends-page-container {
          max-width: 900px;
          margin: 0 auto;
          background: white;
          min-height: 100vh;
          font-family: verdana, arial, sans-serif;
        }
        .friends-page-content {
          padding: 20px;
        }
        .friends-page-header {
          border-bottom: 2px solid #6699cc;
          margin-bottom: 20px;
          padding-bottom: 10px;
        }
        .friends-page-header h2 {
          margin: 0 0 8px 0;
          color: #003399;
          font-size: 16pt;
        }
        .friend-count {
          font-size: 11pt;
          font-weight: normal;
          color: #666;
          margin-left: 8px;
        }
        .back-link {
          color: #003399;
          font-size: 9pt;
          text-decoration: none;
        }
        .back-link:hover {
          text-decoration: underline;
        }
        
        .pagination-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          margin-bottom: 15px;
          border-bottom: 1px solid #eee;
        }
        .pagination-controls.bottom {
          margin-top: 20px;
          margin-bottom: 0;
          border-top: 1px solid #eee;
          border-bottom: none;
          padding-top: 15px;
        }
        .page-info {
          font-size: 9pt;
          color: #666;
        }
        .pagination-buttons {
          display: flex;
          gap: 8px;
        }
        .pagination-btn {
          background: linear-gradient(to bottom, #f5f5f5 0%, #e0e0e0 100%);
          border: 1px solid #ccc;
          padding: 6px 14px;
          font-size: 9pt;
          cursor: pointer;
          border-radius: 3px;
          color: #333;
          font-weight: bold;
        }
        .pagination-btn:hover:not(:disabled) {
          background: linear-gradient(to bottom, #e8f2fc 0%, #d4e6f8 100%);
          border-color: #6699cc;
        }
        .pagination-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .friends-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 15px;
        }
        
        .friend-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 12px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          text-decoration: none;
          background: #fcfcfc;
          transition: all 0.2s ease;
        }
        .friend-card:hover {
          border-color: #6699cc;
          background: #f0f8ff;
          transform: translateY(-2px);
          box-shadow: 0 3px 8px rgba(0,0,0,0.1);
        }
        .friend-avatar {
          border: 2px solid #ccc;
          border-radius: 50%;
          margin-bottom: 8px;
        }
        .friend-card:hover .friend-avatar {
          border-color: #6699cc;
        }
        .friend-name {
          font-size: 8pt;
          color: #003399;
          font-weight: bold;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          width: 100%;
        }
        
        /* Skeleton loading styles */
        .friend-card.skeleton {
          pointer-events: none;
        }
        .skeleton-avatar {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          margin-bottom: 8px;
        }
        .skeleton-name {
          width: 60%;
          height: 12px;
          border-radius: 3px;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        
        @media (max-width: 600px) {
          .friends-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
          }
          .friend-card {
            padding: 8px 4px;
          }
          .friend-avatar {
            width: 50px !important;
            height: 50px !important;
          }
          .skeleton-avatar {
            width: 50px;
            height: 50px;
          }
        }
      `}</style>
    </div>
  );
};

export default FriendsPage;

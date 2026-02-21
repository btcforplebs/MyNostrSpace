import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '../Shared/Avatar';

interface HomeSidebarProps {
    user: any;
    stats: { followers: number | null; posts: number | null; zaps: number | null };
    loadingStats: boolean;
    fetchStats: () => void;
}

export const HomeSidebar: React.FC<HomeSidebarProps> = ({
    user,
    stats,
    loadingStats,
    fetchStats,
}) => {
    const navigate = useNavigate();

    return (
        <div className="home-left">
            <div className="home-box user-pic-box">
                <div className="home-box-body">
                    <Link to={`/p/${user?.npub}`}>
                        <Avatar
                            pubkey={user?.pubkey}
                            src={user?.profile?.image}
                            size={170}
                            className="user-pic"
                        />
                    </Link>
                    <div
                        className="profile-stats-clickable"
                        onClick={fetchStats}
                        title="Click to load stats"
                    >
                        {loadingStats ? (
                            <span>Loading...</span>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <span>Followers: {stats.followers ?? '∞'}</span>
                                <span>Posts: {stats.posts ?? '∞'}</span>
                                <span>Zaps Recv: {stats.zaps ?? '∞'} 丰</span>
                            </div>
                        )}
                    </div>

                    {user?.profile?.about && (
                        <div
                            className="user-bio"
                            style={{
                                fontSize: '9pt',
                                marginTop: '10px',
                                color: '#444',
                                borderTop: '1px solid #ddd',
                                paddingTop: '10px',
                                whiteSpace: 'pre-wrap',
                                lineHeight: '1.4',
                            }}
                        >
                            {user.profile.about}
                        </div>
                    )}
                    <ul className="quick-links">
                        <li>
                            <Link to={`/p/${user?.npub}`}>View My Profile</Link>
                        </li>
                        <li>
                            <Link to="/edit-profile">Edit My Profile</Link>
                        </li>
                        <li>
                            <Link to="/settings">Account Settings</Link>
                        </li>
                        <li>
                            <Link to="/edit-layout">Edit Theme</Link>
                        </li>
                    </ul>
                </div>
            </div>

            <div className="home-box">
                <div className="home-box-header">My Apps</div>
                <div className="home-box-body">
                    <ul className="my-apps-list">
                        <li className="app-item" onClick={() => navigate('/blogs')}>
                            <span className="app-icon">✍️</span> Blogs
                        </li>
                        <li className="app-item" onClick={() => navigate('/videos')}>
                            <span className="app-icon">🎥</span> Videos
                        </li>
                        <li className="app-item" onClick={() => navigate('/recipes')}>
                            <span className="app-icon">🍳</span> Recipes
                        </li>
                        <li className="app-item" onClick={() => navigate('/livestreams')}>
                            <span className="app-icon">📺</span> Live
                        </li>
                        <li className="app-item" onClick={() => navigate('/badges')}>
                            <span className="app-icon">🏆</span> Badges
                        </li>
                        <li className="app-item" onClick={() => navigate('/marketplace')}>
                            <span className="app-icon">🛒</span> Shop
                        </li>
                        <li className="app-item" onClick={() => navigate('/photos')}>
                            <span className="app-icon">🖼️</span> Photos
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

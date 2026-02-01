import { useState, useEffect } from 'react';
import { useNostr } from '../../context/NostrContext';
import { useExtendedProfile, type ExtendedProfileData } from '../../hooks/useExtendedProfile';
import { useProfile, type ExtendedProfile } from '../../hooks/useProfile';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../Shared/Navbar';
import { Top8Editor } from './Top8Editor';
import { WavlakeSearch } from '../Music/WavlakeSearch';

const EditProfilePage = () => {
    const { user, login } = useNostr();
    const { data: extData, loading: extLoading, publish: publishExt } = useExtendedProfile(user?.pubkey);
    const { profile: basicProfile, loading: basicLoading, publishProfile: publishBasic } = useProfile(user?.pubkey);
    const navigate = useNavigate();

    const [basicFormData, setBasicFormData] = useState<ExtendedProfile>({});
    const [extFormData, setExtFormData] = useState<ExtendedProfileData>({
        headline: '',
        gender: '',
        city: '',
        region: '',
        country: '',
        mainClient: '',
        bitcoinerSince: '',
        interests: {
            general: '',
            music: '',
            movies: '',
            heroes: ''
        }
    });

    useEffect(() => {
        if (extData) {
            setExtFormData(prev => ({
                ...prev,
                ...extData,
                interests: { ...prev.interests, ...extData.interests }
            }));
        }
    }, [extData]);

    useEffect(() => {
        if (basicProfile) {
            setBasicFormData(basicProfile);
        }
    }, [basicProfile]);

    const handleSave = async () => {
        await Promise.all([
            publishBasic(basicFormData),
            publishExt(extFormData)
        ]);
        alert('All changes saved!');
        navigate(`/p/${user?.pubkey}`);
    };

    if (!user) {
        return (
            <div style={{ padding: 20 }}>
                <h2>Please Login</h2>
                <button onClick={login}>Login with Extension</button>
            </div>
        );
    }

    const isLoading = extLoading || basicLoading;
    if (isLoading && !basicProfile) return <div>Loading Profile Data...</div>;

    return (
        <div className="edit-profile-container">
            <Navbar />
            <div className="edit-header">
                <h2>Edit Your Profile</h2>
                <div className="edit-nav">
                    <button onClick={() => navigate(`/p/${user?.pubkey}`)}>Back to Profile</button>
                    <button onClick={() => navigate('/edit-layout')} style={{ background: '#cce5ff' }}>Customize Design</button>
                    <button onClick={handleSave} className="save-btn">Save Changes</button>
                </div>
            </div>

            <div className="edit-body">
                {/* Basic Info Section */}
                <div className="edit-section">
                    <h3>Basic Information</h3>
                    <div className="form-group">
                        <label>Display Name</label>
                        <input
                            type="text"
                            value={basicFormData.displayName || ''}
                            onChange={e => setBasicFormData({ ...basicFormData, displayName: e.target.value })}
                            placeholder="Your display name"
                        />
                    </div>
                    <div className="form-group">
                        <label>Name / Username</label>
                        <input
                            type="text"
                            value={basicFormData.name || ''}
                            onChange={e => setBasicFormData({ ...basicFormData, name: e.target.value })}
                            placeholder="Handle"
                        />
                    </div>
                    <div className="form-group">
                        <label>Profile Picture URL</label>
                        <input
                            type="text"
                            value={basicFormData.image || ''}
                            onChange={e => setBasicFormData({ ...basicFormData, image: e.target.value })}
                            placeholder="https://..."
                        />
                    </div>
                    <div className="form-group">
                        <label>Banner URL</label>
                        <input
                            type="text"
                            value={basicFormData.banner || ''}
                            onChange={e => setBasicFormData({ ...basicFormData, banner: e.target.value })}
                            placeholder="https://..."
                        />
                    </div>
                    <div className="form-group">
                        <label>About Me</label>
                        <textarea
                            value={basicFormData.about || ''}
                            onChange={e => setBasicFormData({ ...basicFormData, about: e.target.value })}
                            placeholder="Tell the world about yourself..."
                        />
                    </div>
                </div>

                <div className="edit-section">
                    <h3>Extended Details</h3>
                    <div className="form-group">
                        <label>Headline / Status</label>
                        <input
                            type="text"
                            value={extFormData.headline || ''}
                            onChange={e => setExtFormData({ ...extFormData, headline: e.target.value })}
                            placeholder="e.g. Coding the future"
                        />
                    </div>

                    <div className="form-group">
                        <label>Gender</label>
                        <select
                            value={extFormData.gender || ''}
                            onChange={e => setExtFormData({ ...extFormData, gender: e.target.value })}
                            style={{ padding: '8px', fontFamily: 'monospace' }}
                        >
                            <option value="">Select Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>City / Location</label>
                        <input
                            type="text"
                            value={extFormData.city || ''}
                            onChange={e => setExtFormData({ ...extFormData, city: e.target.value })}
                        />
                    </div>
                </div>

                <div className="edit-section">
                    <Top8Editor />
                </div>

                <div className="edit-section">
                    <h3>Profile Playlist</h3>
                    {(() => {
                        const musicList = Array.isArray(extFormData.music)
                            ? extFormData.music
                            : extFormData.music ? [extFormData.music] : [];

                        return (
                            <>
                                {musicList.length > 0 ? (
                                    <div style={{ marginBottom: '10px' }}>
                                        {musicList.map((track: any, i: number) => (
                                            <div key={i} style={{ padding: '8px', background: '#e0ffe0', border: '1px solid green', marginBottom: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '9pt', fontWeight: 'bold' }}>{i + 1}. {track.title}</span>
                                                <button
                                                    onClick={() => {
                                                        const newList = [...musicList];
                                                        newList.splice(i, 1);
                                                        setExtFormData({ ...extFormData, music: newList });
                                                    }}
                                                    style={{ marginLeft: '10px', background: '#ffcccc', color: 'red', border: '1px solid red', padding: '2px 5px', fontSize: '8pt' }}
                                                >
                                                    remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '9pt', color: '#666', marginBottom: '5px' }}>
                                        No songs selected. Add some below!
                                    </div>
                                )}

                                <WavlakeSearch onSelect={(track: any) => {
                                    const newList = [...musicList, track];
                                    setExtFormData({ ...extFormData, music: newList });
                                }} />
                            </>
                        );
                    })()}
                </div>

                <div className="edit-section">
                    <h3>Interests</h3>
                    <div className="form-group">
                        <label>General</label>
                        <textarea
                            value={extFormData.interests?.general || ''}
                            onChange={e => setExtFormData({
                                ...extFormData,
                                interests: { ...extFormData.interests, general: e.target.value }
                            })}
                        />
                    </div>
                    <div className="form-group">
                        <label>Music</label>
                        <textarea
                            value={extFormData.interests?.music || ''}
                            onChange={e => setExtFormData({
                                ...extFormData,
                                interests: { ...extFormData.interests, music: e.target.value }
                            })}
                        />
                    </div>
                </div>
            </div>

            <style>{`
                .edit-profile-container {
                    max-width: 800px;
                    margin: 20px auto;
                    background-color: #f5f5f5;
                    font-family: Arial, Helvetica, sans-serif;
                    color: #000;
                }
                .edit-header {
                    background-color: #6699cc;
                    padding: 10px 15px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #000;
                }
                .edit-header h2 {
                    margin: 0;
                    color: #fff;
                    font-size: 16pt;
                }
                .edit-body {
                    padding: 20px;
                }
                .edit-section {
                    margin-bottom: 25px;
                    background: #fff;
                    padding: 15px;
                    border: 1px solid #ccc;
                }
                .edit-section h3 {
                    margin-top: 0;
                    background-color: #6699cc;
                    color: white;
                    padding: 5px;
                    font-size: 12pt;
                }
                .form-group {
                    margin-bottom: 15px;
                    display: flex;
                    flex-direction: column;
                }
                .form-group label {
                    font-weight: bold;
                    margin-bottom: 5px;
                    color: #333;
                    font-size: 10pt;
                }
                input, textarea {
                    padding: 8px;
                    font-family: monospace;
                    border: 1px solid #999;
                    background: #fff;
                    color: #000;
                    font-size: 10pt;
                }
                textarea {
                    height: 80px;
                    resize: vertical;
                }
                button {
                    cursor: pointer;
                    padding: 5px 15px;
                    font-weight: bold;
                    font-size: 10pt;
                    border: 2px solid #000;
                    background: #ccc;
                    color: #000;
                }
                .save-btn {
                    background-color: #ff9933;
                    margin-left: 10px;
                }
            `}</style>
        </div>
    );
};

export default EditProfilePage;

import { useState, useEffect } from 'react';
import { useFriends } from '../../hooks/useFriends';
import { useTop8 } from '../../hooks/useTop8';
import { useNostr } from '../../context/NostrContext';
import { NDKUser } from '@nostr-dev-kit/ndk';

export const Top8Editor = () => {
    const { user } = useNostr();
    const { top8, saveTop8, loading: top8Loading } = useTop8(user?.pubkey);
    // Fetch all friends (pubkeys only first) then we can resolve names
    const { friends: friendPubkeys, fetchProfiles } = useFriends(user?.pubkey);

    const [currentTop8, setCurrentTop8] = useState<NDKUser[]>([]);
    const [allFriends, setAllFriends] = useState<NDKUser[]>([]);
    const [search, setSearch] = useState('');
    const [loadingFriends, setLoadingFriends] = useState(false);

    // Initialize state from hooks
    useEffect(() => {
        if (top8) setCurrentTop8(top8);
    }, [top8]);

    // Load friend profiles when component mounts or pubkeys change (debounce or load all?)
    // For editor, we probably want to load a chunk or allow searching. 
    // Let's load the first 100 for now or implement search-based loading.
    useEffect(() => {
        const loadFriends = async () => {
            if (friendPubkeys.length > 0 && allFriends.length === 0 && fetchProfiles) {
                setLoadingFriends(true);
                // Load ALL friends as requested
                const profiles = await fetchProfiles(friendPubkeys);
                setAllFriends(profiles);
                setLoadingFriends(false);
            }
        };
        loadFriends();
    }, [friendPubkeys, fetchProfiles, allFriends.length]);

    const addToTop8 = (friend: NDKUser) => {
        if (currentTop8.find(u => u.pubkey === friend.pubkey)) return;
        if (currentTop8.length >= 8) {
            alert("Top 8 is full! Remove someone first.");
            return;
        }
        setCurrentTop8([...currentTop8, friend]);
    };

    const removeFromTop8 = (pubkey: string) => {
        setCurrentTop8(currentTop8.filter(u => u.pubkey !== pubkey));
    };

    const handleSave = async () => {
        await saveTop8(currentTop8);
    };

    const filteredFriends = allFriends.filter(f => {
        const name = f.profile?.displayName || f.profile?.name || '';
        return name.toLowerCase().includes(search.toLowerCase());
    });

    if (top8Loading) return <div>Loading Top 8...</div>;

    return (
        <div className="top8-editor">
            <h3>Manage Your Top 8</h3>

            {/* Current Top 8 */}
            <div className="current-top8-container">
                {currentTop8.map((friend, idx) => (
                    <div key={friend.pubkey} className="top8-slot-editor">
                        <span className="slot-number">{idx + 1}</span>
                        <img
                            src={friend.profile?.image || 'https://via.placeholder.com/50'}
                            alt="friend"
                        />
                        <div className="name">{friend.profile?.name || 'Unknown'}</div>
                        <button className="remove-btn" onClick={() => removeFromTop8(friend.pubkey)}>x</button>
                    </div>
                ))}
                {/* Empty Slots */}
                {[...Array(8 - currentTop8.length)].map((_, i) => (
                    <div key={`empty-${i}`} className="top8-slot-editor empty">
                        <span className="slot-number">{currentTop8.length + i + 1}</span>
                        <div className="empty-circle"></div>
                        <div className="name">Empty</div>
                    </div>
                ))}
            </div>

            <div className="controls">
                <button onClick={handleSave} className="save-btn">Save Top 8 Changes</button>
            </div>

            <hr />

            {/* Friend Selector */}
            <div className="friend-selector">
                <h4>Select Friends to Add</h4>
                <input
                    type="text"
                    placeholder="Search loaded friends..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ marginBottom: 10, width: '100%' }}
                />

                <div className="friend-list-scroll">
                    {loadingFriends ? <div>Loading {friendPubkeys.length} friends...</div> : (
                        filteredFriends.map(friend => (
                            <div key={friend.pubkey} className="friend-select-item" onClick={() => addToTop8(friend)}>
                                <img src={friend.profile?.image || 'https://via.placeholder.com/40'} alt="friend" />
                                <span>{friend.profile?.name || 'Unknown'}</span>
                                <span className="add-icon">+</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <style>{`
                /* ... existing styles ... */
                
                .top8-editor {
                    background: #fff;
                    padding: 15px;
                    border: 1px solid #ccc;
                    margin-bottom: 20px;
                }
                .current-top8-container {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-bottom: 15px;
                    background: #f0f0f0;
                    padding: 10px;
                }
                .top8-slot-editor {
                    width: 70px;
                    text-align: center;
                    position: relative;
                    background: white;
                    padding: 5px;
                    border: 1px solid #ccc;
                }
                .top8-slot-editor img {
                    width: 50px;
                    height: 50px;
                    object-fit: cover;
                }
                .top8-slot-editor .name {
                    font-size: 8pt;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .remove-btn {
                    position: absolute;
                    top: -5px;
                    right: -5px;
                    background: red;
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 20px;
                    height: 20px;
                    font-size: 10pt;
                    cursor: pointer;
                    line-height: 18px;
                    padding: 0;
                }
                .top8-slot-editor.empty .empty-circle {
                    width: 50px;
                    height: 50px;
                    background: #ddd;
                    margin: 0 auto;
                    border-radius: 50%;
                }
                
                .friend-list-scroll {
                    max-height: 200px;
                    overflow-y: auto;
                    border: 1px solid #ccc;
                }
                .friend-select-item {
                    display: flex;
                    align-items: center;
                    padding: 5px;
                    cursor: pointer;
                    border-bottom: 1px solid #eee;
                }
                .friend-select-item:hover {
                    background: #e5f0ff;
                }
                .friend-select-item img {
                    width: 30px;
                    height: 30px;
                    object-fit: cover;
                    margin-right: 10px;
                }
                .friend-select-item .add-icon {
                    margin-left: auto;
                    font-weight: bold;
                    color: green;
                }
            `}</style>
        </div>
    );
};

import { useState, useEffect } from 'react';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent } from '@nostr-dev-kit/ndk';

interface BadgeDefinition {
    id: string;
    pubkey: string;
    dTag: string;
    name: string;
    image: string;
}

interface AwardBadgeModalProps {
    recipientPubkey?: string;
    preSelectedBadgeId?: string; // a-tag format: 30009:pubkey:dTag
    onClose: () => void;
    onSuccess: () => void;
}

export const AwardBadgeModal = ({ recipientPubkey, preSelectedBadgeId, onClose, onSuccess }: AwardBadgeModalProps) => {
    const { ndk, user: loggedInUser } = useNostr();
    const [myBadges, setMyBadges] = useState<BadgeDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedBadge, setSelectedBadge] = useState<BadgeDefinition | null>(null);
    const [awarding, setAwarding] = useState(false);
    const [recipientName, setRecipientName] = useState<string>('');
    const [recipientInput, setRecipientInput] = useState<string>(recipientPubkey || '');
    const [resolvedPubkey, setResolvedPubkey] = useState<string>(recipientPubkey || '');

    useEffect(() => {
        if (!ndk || !loggedInUser) return;

        const fetchMyBadges = async () => {
            setLoading(true);
            try {
                const events = await ndk.fetchEvents({
                    kinds: [30009 as number],
                    authors: [loggedInUser.pubkey],
                });

                const definitions: BadgeDefinition[] = Array.from(events).map(event => ({
                    id: `30009:${event.pubkey}:${event.getMatchingTags('d')[0]?.[1]}`,
                    pubkey: event.pubkey,
                    dTag: event.getMatchingTags('d')[0]?.[1] || '',
                    name: event.getMatchingTags('name')[0]?.[1] || 'Untitled',
                    image: event.getMatchingTags('image')[0]?.[1] || '',
                })).filter(b => b.dTag && b.image);

                setMyBadges(definitions);

                if (preSelectedBadgeId) {
                    const pre = definitions.find(b => b.id === preSelectedBadgeId);
                    if (pre) setSelectedBadge(pre);
                } else if (definitions.length > 0) {
                    setSelectedBadge(definitions[0]);
                }
            } catch (err) {
                console.error('Failed to fetch your badges:', err);
            } finally {
                setLoading(false);
            }
        };

        const fetchRecipientProfile = async (pubkey: string) => {
            try {
                const profile = await ndk.getUser({ pubkey }).fetchProfile();
                setRecipientName(profile?.name || profile?.displayName || pubkey.slice(0, 8));
            } catch {
                setRecipientName(pubkey.slice(0, 8));
            }
        };

        fetchMyBadges();
        if (recipientPubkey) {
            fetchRecipientProfile(recipientPubkey);
        } else {
            setLoading(false); // No badges to fetch if we don't know the user yet? No, we still need to fetch myBadges.
        }
    }, [ndk, loggedInUser, recipientPubkey, preSelectedBadgeId]);

    const handleRecipientChange = async (val: string) => {
        setRecipientInput(val);
        if (val.length >= 64) {
            setResolvedPubkey(val);
            // try to fetch name
            try {
                const profile = await ndk?.getUser({ pubkey: val }).fetchProfile();
                setRecipientName(profile?.name || profile?.displayName || val.slice(0, 8));
            } catch {
                setRecipientName(val.slice(0, 8));
            }
        }
    };

    const handleAward = async () => {
        if (!ndk || !loggedInUser || !selectedBadge || !resolvedPubkey) return;

        setAwarding(true);
        try {
            // NIP-58 Badge Award (Kind 8)
            const event = new NDKEvent(ndk);
            event.kind = 8;
            event.tags = [
                ['a', selectedBadge.id],
                ['p', resolvedPubkey],
            ];
            event.content = '';

            await event.sign();
            await event.publish();

            alert(`Badge "${selectedBadge.name}" awarded successfully!`);
            onSuccess();
            onClose();
        } catch (err) {
            console.error('Failed to award badge:', err);
            alert('Failed to award badge. Please try again.');
        } finally {
            setAwarding(false);
        }
    };

    return (
        <div className="badge-modal-overlay" onClick={onClose}>
            <div className="badge-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="badges-section-header">Award a Badge</h3>

                <div className="badge-modal-form" style={{ marginTop: '10px' }}>
                    <label>
                        Recipient Pubkey
                        <input
                            type="text"
                            className="nostr-input"
                            placeholder="hex pubkey..."
                            value={recipientInput}
                            onChange={(e) => handleRecipientChange(e.target.value)}
                            disabled={!!recipientPubkey}
                        />
                    </label>
                    {recipientName && (
                        <p style={{ fontSize: '9pt', marginTop: '5px' }}>
                            Awarding to: <b>{recipientName}</b>
                        </p>
                    )}
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '20px' }}>Loading your badges...</div>
                ) : myBadges.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                        <p>You haven't created any badges yet.</p>
                        <button onClick={onClose} className="badge-cancel-btn">Close</button>
                    </div>
                ) : (
                    <div className="badge-modal-form">
                        <label>
                            Select Badge
                            <select
                                className="nostr-input"
                                value={selectedBadge?.id || ''}
                                onChange={(e) => setSelectedBadge(myBadges.find(b => b.id === e.target.value) || null)}
                            >
                                {myBadges.map(badge => (
                                    <option key={badge.id} value={badge.id}>
                                        {badge.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {selectedBadge && (
                            <div className="badge-award-preview" style={{ textAlign: 'center', margin: '20px 0' }}>
                                <img
                                    src={selectedBadge.image}
                                    alt={selectedBadge.name}
                                    style={{ width: '80px', height: '80px', objectFit: 'contain', border: '1px solid #ccc', padding: '5px' }}
                                />
                                <div style={{ fontSize: '10pt', fontWeight: 'bold' }}>{selectedBadge.name}</div>
                            </div>
                        )}

                        <div className="badge-modal-actions">
                            <button onClick={onClose} className="badge-cancel-btn">
                                Cancel
                            </button>
                            <button
                                onClick={handleAward}
                                className="badges-create-btn"
                                disabled={awarding || !selectedBadge || !resolvedPubkey}
                            >
                                {awarding ? 'Awarding...' : 'Award Badge'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

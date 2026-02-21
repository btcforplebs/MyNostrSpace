import { useState } from 'react';
import NDK from '@nostr-dev-kit/ndk';
import { useProfileBadges } from '../../hooks/useProfileBadges';
import { AwardBadgeModal } from '../Badges/AwardBadgeModal';
import { useNostr } from '../../context/NostrContext';

export const ProfileBadges = ({
    ndk,
    pubkey,
    userNpub,
}: {
    ndk: NDK | undefined;
    pubkey: string;
    userNpub: string | undefined;
}) => {
    const { user } = useNostr(); // Logged-in user granting badges
    const { badges, loadingBadges } = useProfileBadges(ndk, pubkey);

    const [isAwardModalOpen, setIsAwardModalOpen] = useState(false);

    // You can only award if you're logged in AND you're NOT looking at your own profile
    const canAward = Boolean(user && user.npub !== userNpub);

    return (
        <div className="profile-badges-tab" style={{ padding: '20px' }}>
            <div
                className="profile-badges-header"
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                }}
            >
                <h3 style={{ margin: 0, color: '#333' }}>Accepted Badges</h3>
                {canAward && (
                    <button
                        onClick={() => setIsAwardModalOpen(true)}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#ff9933',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                        }}
                    >
                        Award Badge
                    </button>
                )}
            </div>

            {loadingBadges && badges.length === 0 && <div>Loading badges...</div>}
            {!loadingBadges && badges.length === 0 && (
                <div style={{ color: '#666' }}>This user has not accepted any badges yet.</div>
            )}

            <div
                className="badges-grid"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '20px',
                }}
            >
                {badges.map((b) => (
                    <div
                        key={b.id}
                        className="badge-card"
                        style={{
                            border: '1px solid #eee',
                            borderRadius: '8px',
                            padding: '15px',
                            background: '#fff',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'center',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                        }}
                    >
                        {b.image ? (
                            <img
                                src={b.image}
                                alt={b.name}
                                style={{
                                    width: '100px',
                                    height: '100px',
                                    objectFit: 'contain',
                                    marginBottom: '10px',
                                }}
                            />
                        ) : (
                            <div
                                style={{
                                    width: '100px',
                                    height: '100px',
                                    background: '#f0f0f0',
                                    borderRadius: '50%',
                                    marginBottom: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                🏆
                            </div>
                        )}
                        <h4 style={{ margin: '0 0 5px 0', fontSize: '16px', color: '#333' }}>{b.name}</h4>
                        <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#666' }}>
                            {b.description}
                        </p>
                        {b.issuerName && (
                            <div style={{ fontSize: '11px', color: '#888', marginTop: 'auto' }}>
                                Issued by: <strong>{b.issuerName}</strong>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Re-using the Award Modal created previously */}
            {isAwardModalOpen && user && (
                <AwardBadgeModal
                    onClose={() => setIsAwardModalOpen(false)}
                    onSuccess={() => setIsAwardModalOpen(false)}
                    recipientPubkey={pubkey}
                />
            )}
        </div>
    );
};

import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { type NDKFilter, NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import { SEO } from '../Shared/SEO';
import { useCustomLayout } from '../../hooks/useCustomLayout';
import './BadgesPage.css';

interface Badge {
    id: string;
    pubkey: string;
    dTag: string;
    name: string;
    description: string;
    image: string;
    thumb?: string;
    creatorName?: string;
    created_at: number;
}

export const BadgesPage = () => {
    const { ndk, user: loggedInUser } = useNostr();
    const { layoutCss } = useCustomLayout(loggedInUser?.pubkey);
    const [badges, setBadges] = useState<Badge[]>([]);
    const [awardCounts, setAwardCounts] = useState<Map<string, number>>(new Map());
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    // Badge creation modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [badgeName, setBadgeName] = useState('');
    const [badgeDescription, setBadgeDescription] = useState('');
    const [badgeImage, setBadgeImage] = useState('');

    const badgeBufferRef = useRef<Badge[]>([]);
    const isUpdatePendingRef = useRef(false);
    const fetchingRef = useRef(false);
    const loadTrackerRef = useRef(0);

    const handleCreateBadge = async () => {
        if (!ndk || !loggedInUser || !badgeName.trim() || !badgeImage.trim()) {
            alert('Please fill in badge name and image URL');
            return;
        }

        setCreating(true);
        try {
            // Generate a unique d-tag from name
            const dTag = badgeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

            const event = new NDKEvent(ndk);
            event.kind = 30009;
            event.tags = [
                ['d', dTag],
                ['name', badgeName.trim()],
                ['description', badgeDescription.trim()],
                ['image', badgeImage.trim()],
            ];
            event.content = '';

            await event.sign();
            await event.publish();

            // Add to local list immediately
            const newBadge: Badge = {
                id: event.id,
                pubkey: loggedInUser.pubkey,
                dTag,
                name: badgeName.trim(),
                description: badgeDescription.trim(),
                image: badgeImage.trim(),
                created_at: Math.floor(Date.now() / 1000),
                creatorName: 'You',
            };
            setBadges(prev => [newBadge, ...prev]);

            // Reset form
            setBadgeName('');
            setBadgeDescription('');
            setBadgeImage('');
            setShowCreateModal(false);
            alert('Badge created successfully!');
        } catch (err) {
            console.error('Failed to create badge:', err);
            alert('Failed to create badge. Please try again.');
        } finally {
            setCreating(false);
        }
    };

    const processBuffer = useCallback(() => {
        if (badgeBufferRef.current.length === 0) return;

        setBadges((prev) => {
            const next = [...prev];
            let changed = false;

            for (const badge of badgeBufferRef.current) {
                // Dedupe by pubkey:dTag (addressable event key)
                const key = `${badge.pubkey}:${badge.dTag}`;
                if (!next.find((b) => `${b.pubkey}:${b.dTag}` === key)) {
                    next.push(badge);
                    changed = true;
                }
            }

            badgeBufferRef.current = [];
            isUpdatePendingRef.current = false;

            if (!changed) return prev;
            return next.sort((a, b) => b.created_at - a.created_at);
        });
    }, []);

    const handleBadgeDefinition = useCallback(
        (event: NDKEvent) => {
            const dTag = event.getMatchingTags('d')[0]?.[1];
            if (!dTag) return;

            const name = event.getMatchingTags('name')[0]?.[1] || dTag;
            const description = event.getMatchingTags('description')[0]?.[1] || '';
            const imageTag = event.getMatchingTags('image')[0];
            const image = imageTag?.[1] || '';
            const thumbTag = event.getMatchingTags('thumb')[0];
            const thumb = thumbTag?.[1];

            if (!image) return; // Skip badges without images

            if (loadingMore) {
                loadTrackerRef.current++;
            }

            const badge: Badge = {
                id: event.id,
                pubkey: event.pubkey,
                dTag,
                name,
                description,
                image,
                thumb,
                created_at: event.created_at || 0,
            };

            badgeBufferRef.current.push(badge);
            if (!isUpdatePendingRef.current) {
                isUpdatePendingRef.current = true;
                setTimeout(processBuffer, 300);
            }

            // Fetch creator profile asynchronously
            ndk
                ?.getUser({ pubkey: event.pubkey })
                .fetchProfile()
                .then((profile) => {
                    setBadges((prev) =>
                        prev.map((b) =>
                            b.pubkey === event.pubkey && !b.creatorName
                                ? {
                                    ...b,
                                    creatorName:
                                        profile?.name ||
                                        profile?.displayName ||
                                        profile?.nip05 ||
                                        event.pubkey.slice(0, 8),
                                }
                                : b
                        )
                    );
                })
                .catch(() => { });
        },
        [ndk, loadingMore, processBuffer]
    );

    const handleBadgeAward = useCallback((event: NDKEvent) => {
        const aTag = event.getMatchingTags('a')[0]?.[1];
        if (!aTag) return;

        setAwardCounts((prev) => {
            const next = new Map(prev);
            const current = next.get(aTag) || 0;
            next.set(aTag, current + 1);
            return next;
        });
    }, []);

    useEffect(() => {
        if (!ndk) return;

        setLoading(true);

        // Fetch badge definitions (Kind 30009)
        const defFilter: NDKFilter = {
            kinds: [30009 as number],
            limit: 100,
        };

        const defSub = ndk.subscribe(defFilter, {
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
        });

        defSub.on('event', handleBadgeDefinition);
        defSub.on('eose', () => {
            setLoading(false);
            processBuffer();
            console.log('Badges Page: Initial badge definitions fetch complete');
        });

        // Fetch badge awards (Kind 8) to count popularity
        const awardFilter: NDKFilter = {
            kinds: [8 as number],
            limit: 500,
        };

        const awardSub = ndk.subscribe(awardFilter, {
            closeOnEose: true,
            cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
        });

        awardSub.on('event', handleBadgeAward);

        return () => {
            defSub.stop();
            awardSub.stop();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ndk, handleBadgeDefinition, handleBadgeAward]);

    const handleLoadMore = useCallback(async () => {
        if (!ndk || badges.length === 0 || loadingMore || fetchingRef.current || !hasMore) return;
        fetchingRef.current = true;
        setLoadingMore(true);
        loadTrackerRef.current = 0;

        const oldestTimestamp = Math.min(...badges.map((b) => b.created_at));
        console.log(
            'Badges Page: Loading more badges before',
            new Date(oldestTimestamp * 1000).toLocaleString()
        );

        const filter: NDKFilter = {
            kinds: [30009 as number],
            until: oldestTimestamp - 1,
            limit: 100,
        };

        const sub = ndk.subscribe(filter, { closeOnEose: true });
        sub.on('event', handleBadgeDefinition);
        sub.on('eose', () => {
            setLoadingMore(false);
            fetchingRef.current = false;
            processBuffer();

            if (loadTrackerRef.current === 0) {
                console.log('Badges Page: No more badges found, disabling infinite scroll.');
                setHasMore(false);
            }

            console.log('Badges Page: Load More complete, found:', loadTrackerRef.current);
        });
    }, [ndk, badges, loadingMore, hasMore, handleBadgeDefinition, processBuffer]);

    useEffect(() => {
        const handleScroll = () => {
            const scrollBottom = window.innerHeight + window.scrollY;
            const threshold = document.body.offsetHeight - 800;

            if (
                scrollBottom >= threshold &&
                !fetchingRef.current &&
                badges.length > 0 &&
                !loadingMore &&
                hasMore
            ) {
                handleLoadMore();
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [badges.length, loadingMore, hasMore, handleLoadMore]);

    // Sort badges by award count for "trending" feel
    const sortedBadges = [...badges].sort((a, b) => {
        const aKey = `30009:${a.pubkey}:${a.dTag}`;
        const bKey = `30009:${b.pubkey}:${b.dTag}`;
        const aCount = awardCounts.get(aKey) || 0;
        const bCount = awardCounts.get(bKey) || 0;
        return bCount - aCount || b.created_at - a.created_at;
    });

    return (
        <div className="home-page-container badges-page-container">
            {layoutCss && <style>{layoutCss}</style>}
            <SEO title="Badges" description="Discover and explore NIP-58 badges on Nostr." />

            <div className="home-wrapper badges-wrapper">
                <Navbar />

                <div className="home-content badges-content">
                    <h2 className="badges-section-header">Nostr Badges</h2>
                    <p className="badges-subtitle">
                        Discover verifiable achievements on Nostr.{' '}
                        {loggedInUser && (
                            <button
                                className="badges-create-btn"
                                onClick={() => setShowCreateModal(true)}
                            >
                                + Create Badge
                            </button>
                        )}
                    </p>

                    {loading && badges.length === 0 ? (
                        <div className="badges-loading-state">
                            <div className="badges-spinner"></div>
                            <p>Searching for badges on Nostr...</p>
                        </div>
                    ) : (
                        <>
                            <div className="badges-grid">
                                {sortedBadges.map((badge) => {
                                    const badgeKey = `30009:${badge.pubkey}:${badge.dTag}`;
                                    const count = awardCounts.get(badgeKey) || 0;

                                    return (
                                        <div key={badge.id} className="badge-card">
                                            <div className="badge-image-container">
                                                <img
                                                    src={badge.thumb || badge.image}
                                                    alt={badge.name}
                                                    className="badge-image"
                                                    loading="lazy"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).src = badge.image;
                                                    }}
                                                />
                                            </div>
                                            <div className="badge-info">
                                                <div className="badge-name" title={badge.name}>
                                                    {badge.name}
                                                </div>
                                                {badge.description && (
                                                    <div className="badge-description" title={badge.description}>
                                                        {badge.description.length > 80
                                                            ? badge.description.slice(0, 80) + '...'
                                                            : badge.description}
                                                    </div>
                                                )}
                                                <div className="badge-meta">
                                                    <Link
                                                        to={`/p/${badge.pubkey}`}
                                                        className="badge-creator"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        By: {badge.creatorName || badge.pubkey.slice(0, 8)}
                                                    </Link>
                                                    {count > 0 && <span className="badge-award-count">🎖️ {count} awarded</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {loadingMore && (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                                    Loading more badges...
                                </div>
                            )}

                            {!loadingMore && hasMore && badges.length > 0 && (
                                <div style={{ padding: '20px', textAlign: 'center' }}>
                                    <button onClick={handleLoadMore} className="badges-load-more-btn">
                                        Load More Badges
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {!loading && badges.length === 0 && (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                            No badges found. Check back later or try adding more relays!
                        </div>
                    )}
                </div>
            </div>

            {/* Create Badge Modal */}
            {showCreateModal && (
                <div className="badge-modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="badge-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="badges-section-header">Create a Badge</h3>
                        <div className="badge-modal-form">
                            <label>
                                Badge Name *
                                <input
                                    type="text"
                                    value={badgeName}
                                    onChange={(e) => setBadgeName(e.target.value)}
                                    placeholder="e.g. Early Adopter"
                                    className="nostr-input"
                                />
                            </label>
                            <label>
                                Description
                                <textarea
                                    value={badgeDescription}
                                    onChange={(e) => setBadgeDescription(e.target.value)}
                                    placeholder="What does this badge represent?"
                                    className="nostr-input"
                                    rows={3}
                                />
                            </label>
                            <label>
                                Image URL *
                                <input
                                    type="text"
                                    value={badgeImage}
                                    onChange={(e) => setBadgeImage(e.target.value)}
                                    placeholder="https://example.com/badge.png"
                                    className="nostr-input"
                                />
                            </label>
                            {badgeImage && (
                                <div className="badge-image-preview">
                                    <img src={badgeImage} alt="Preview" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                </div>
                            )}
                            <div className="badge-modal-actions">
                                <button onClick={() => setShowCreateModal(false)} className="badge-cancel-btn">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateBadge}
                                    className="badges-create-btn"
                                    disabled={creating || !badgeName.trim() || !badgeImage.trim()}
                                >
                                    {creating ? 'Creating...' : 'Create Badge'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

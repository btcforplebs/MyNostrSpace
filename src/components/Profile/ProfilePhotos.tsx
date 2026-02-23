import { useState, useEffect } from 'react';
import NDK, { NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';

export interface PhotoFile {
    id: string;
    pubkey: string;
    url: string;
    title: string;
    authorName?: string;
    created_at: number;
}

export const ProfilePhotos = ({ ndk, pubkey: hexPubkey }: { ndk: NDK | undefined; pubkey: string }) => {
    const [photos, setPhotos] = useState<PhotoFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedPhotoId, setExpandedPhotoId] = useState<string | null>(null);
    const [columns, setColumns] = useState(3);

    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            if (width <= 600) setColumns(1);
            else if (width <= 900) setColumns(2);
            else setColumns(3);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!ndk || !hexPubkey) return;
        setLoading(true);

        const matchImageBaseUrl = (url: string) => {
            return (
                url.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) ||
                url.includes('voidcat.com') ||
                url.includes('nostr.build') ||
                url.includes('imgur.com')
            );
        };

        const filter: NDKFilter = {
            kinds: [1, 20],
            authors: [hexPubkey],
            limit: 100,
        };

        // Imeta filter for NIP-92
        const imetaFilter: NDKFilter = {
            kinds: [1063],
            authors: [hexPubkey],
            limit: 100,
        };


        const sub = ndk.subscribe([filter, imetaFilter], {
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
        });

        const newPhotos: PhotoFile[] = [];

        sub.on('event', (ev: NDKEvent) => {
            if (ev.kind === 1063) {
                let fileUrl = '';
                let fileType = '';
                ev.tags.forEach((t) => {
                    if (t[0] === 'url') fileUrl = t[1];
                    if (t[0] === 'm') fileType = t[1];
                });
                if (fileUrl && fileType.startsWith('image/')) {
                    newPhotos.push({
                        id: ev.id,
                        pubkey: ev.pubkey,
                        url: fileUrl,
                        title: ev.content || 'Photo',
                        created_at: ev.created_at || 0,
                    });
                }
            } else if (ev.kind === 1 || ev.kind === 20) {
                const urls = ev.content.match(/https?:\/\/[^\s]+/g);
                if (urls) {
                    urls.forEach((url) => {
                        if (matchImageBaseUrl(url)) {
                            newPhotos.push({
                                id: ev.id + '-' + url,
                                pubkey: ev.pubkey,
                                url,
                                title: ev.content.length < 50 ? ev.content : 'Photo',
                                created_at: ev.created_at || 0,
                            });
                        }
                    });
                }
            }
        });

        sub.on('eose', () => {
            // deduplicate by URL
            const unique = Array.from(new Map(newPhotos.map((p) => [p.url, p])).values());
            unique.sort((a, b) => b.created_at - a.created_at);
            setPhotos(unique);
            setLoading(false);
        });

        return () => {
            sub.stop();
        };
    }, [ndk, hexPubkey]);


    if (loading && photos.length === 0) return <div style={{ padding: '20px' }}>Loading Photos...</div>;
    if (photos.length === 0) return <div style={{ padding: '20px' }}>No photos found.</div>;

    const masonryColumns: PhotoFile[][] = Array.from({ length: columns }, () => []);
    photos.forEach((photo, i) => {
        masonryColumns[i % columns].push(photo);
    });

    return (
        <div style={{ background: 'white' }}>
            <div className="photo-gallery-masonry" style={{ padding: '15px' }}>
                {masonryColumns.map((col, colIndex) => (
                    <div key={colIndex} className="photo-masonry-column" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {col.map((photo) => (
                            <div
                                key={photo.id}
                                className={`photo-masonry-item ${expandedPhotoId === photo.id ? 'expanded' : ''}`}
                                onClick={() => setExpandedPhotoId(expandedPhotoId === photo.id ? null : photo.id)}
                                style={{ cursor: 'pointer', borderRadius: '8px', overflow: 'hidden', background: '#f0f0f0', position: 'relative' }}
                            >
                                <img
                                    src={photo.url}
                                    alt={photo.title}
                                    loading="lazy"
                                    style={{ width: '100%', display: 'block' }}
                                />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};

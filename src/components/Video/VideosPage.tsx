import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKKind, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import './VideosPage.css';

interface VideoFile {
    id: string;
    pubkey: string;
    url: string;
    title: string;
    thumbnail?: string;
    mime?: string;
    authorName?: string;
}

export const VideosPage = () => {
    const { ndk } = useNostr();
    const [videos, setVideos] = useState<VideoFile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!ndk) return;

        const fetchVideos = async () => {
            setLoading(true);
            try {
                // Fetch Kind 1063 (File Header)
                // Filter for video MIME types in client or if relay supports it?
                // Relays often don't support filtering by 'm' tag easily without searching.
                // We'll fetch 1063s and filter manually for now.
                const filter: NDKFilter = {
                    kinds: [1063 as NDKKind],
                    limit: 50
                };

                const events = await ndk.fetchEvents(filter);
                const sortedEvents = Array.from(events).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

                const formattedVideos: VideoFile[] = [];

                for (const event of sortedEvents) {
                    const url = event.getMatchingTags('url')[0]?.[1];
                    const mime = event.getMatchingTags('m')[0]?.[1];

                    // Basic filtering for video MIME types
                    if (url && mime && mime.startsWith('video/')) {
                        const title = event.content || 'Untitled Video'; // Kind 1063 content is often the description/title
                        const thumb = event.getMatchingTags('thumb')[0]?.[1]; // NIP-94

                        formattedVideos.push({
                            id: event.id,
                            pubkey: event.pubkey,
                            url,
                            title,
                            mime,
                            thumbnail: thumb
                        });
                    }
                }

                // Fetch authors
                const pubkeys = new Set(formattedVideos.map(v => v.pubkey));
                if (pubkeys.size > 0) {
                    await Promise.all(formattedVideos.map(async (video) => {
                        const user = ndk.getUser({ pubkey: video.pubkey });
                        const profile = await user.fetchProfile();
                        video.authorName = profile?.name || profile?.displayName || video.pubkey.slice(0, 8);
                    }));
                }

                setVideos(formattedVideos);

            } catch (err) {
                console.error("Failed to fetch videos", err);
            } finally {
                setLoading(false);
            }
        };

        fetchVideos();
    }, [ndk]);

    return (
        <div className="videos-page-container">
            <div className="videos-header-area">
                <Navbar />
            </div>

            <div className="videos-content">
                <h2 className="section-header">Recent Videos</h2>

                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center' }}>Loading videos...</div>
                ) : (
                    <div className="videos-grid">
                        {videos.map((video) => (
                            <div key={video.id} className="video-card">
                                <div className="video-player-container">
                                    <video
                                        src={video.url}
                                        poster={video.thumbnail}
                                        controls
                                        className="video-player"
                                        preload="metadata"
                                    />
                                </div>
                                <div className="video-info">
                                    <div className="video-title" title={video.title}>{video.title}</div>
                                    <Link to={`/p/${video.pubkey}`} className="video-author">
                                        ByType: {video.authorName}
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!loading && videos.length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center' }}>No videos found. Check back later!</div>
                )}
            </div>
        </div>
    );
};

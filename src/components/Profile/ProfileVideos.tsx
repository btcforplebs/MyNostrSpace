import { useState, useEffect } from 'react';
import NDK, { NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';

// Helper component for thumbnails
const VideoThumbnail = ({ src }: { src: string }) => {
    return (
        <video
            src={src}
            preload="metadata"
            style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
            }}
            muted
            playsInline
        />
    );
};

export interface VideoItem {
    id: string;
    url: string;
    thumb?: string;
    title: string;
    created_at: number;
}

export const ProfileVideos = ({ ndk, pubkey }: { ndk: NDK | undefined; pubkey: string }) => {
    const [videos, setVideos] = useState<VideoItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedVideo, setExpandedVideo] = useState<string | null>(null);

    useEffect(() => {
        if (!ndk || !pubkey) return;
        setLoading(true);

        const matchVideoBaseUrl = (url: string) => {
            return (
                url.match(/\.(mp4|mov|webm)$/i) ||
                url.includes('youtube.com') ||
                url.includes('youtu.be') ||
                url.includes('vimeo.com') ||
                url.includes('streamable.com')
            );
        };

        const filter: NDKFilter = {
            kinds: [1, 20],
            authors: [pubkey],
            limit: 100,
        };

        const imetaFilter: NDKFilter = {
            kinds: [1063],
            authors: [pubkey],
            limit: 100,
        };

        const sub = ndk.subscribe([filter, imetaFilter], {
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST,
        });

        const newVideos: VideoItem[] = [];

        sub.on('event', (ev: NDKEvent) => {
            if (ev.kind === 1063) {
                let fileUrl = '';
                let fileType = '';
                let thumbUrl = '';
                ev.tags.forEach((t) => {
                    if (t[0] === 'url') fileUrl = t[1];
                    if (t[0] === 'm') fileType = t[1];
                    if (t[0] === 'thumb') thumbUrl = t[1];
                });
                if (fileUrl && fileType.startsWith('video/')) {
                    newVideos.push({
                        id: ev.id,
                        url: fileUrl,
                        thumb: thumbUrl,
                        title: ev.content || 'Video',
                        created_at: ev.created_at || 0,
                    });
                }
            } else if (ev.kind === 1 || ev.kind === 20) {
                const urls = ev.content.match(/https?:\/\/[^\s]+/g);
                if (urls) {
                    urls.forEach((url) => {
                        if (matchVideoBaseUrl(url)) {
                            newVideos.push({
                                id: ev.id + '-' + url,
                                url,
                                title: ev.content.length < 50 ? ev.content : 'Video',
                                created_at: ev.created_at || 0,
                            });
                        }
                    });
                }
            }
        });

        sub.on('eose', () => {
            const unique = Array.from(new Map(newVideos.map((p) => [p.url, p])).values());
            unique.sort((a, b) => b.created_at - a.created_at);
            setVideos(unique);
            setLoading(false);
        });

        return () => {
            sub.stop();
        };
    }, [ndk, pubkey]);

    if (loading && videos.length === 0) return <div style={{ padding: '20px' }}>Loading Videos...</div>;
    if (videos.length === 0) return <div style={{ padding: '20px' }}>No videos found.</div>;

    return (
        <div className="media-gallery">
            {videos.map((video) => {
                const isExpanded = expandedVideo === video.id;

                const renderVideoEmbed = (url: string) => {
                    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
                    if (ytMatch) {
                        return (
                            <iframe
                                src={`https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`}
                                title="YouTube video"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                style={{ width: '100%', height: '100%', border: 'none' }}
                            />
                        );
                    }
                    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
                    if (vimeoMatch) {
                        return (
                            <iframe
                                src={`https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`}
                                title="Vimeo video"
                                allow="autoplay; fullscreen; picture-in-picture"
                                allowFullScreen
                                style={{ width: '100%', height: '100%', border: 'none' }}
                            />
                        );
                    }
                    const streamableMatch = url.match(/streamable\.com\/([a-zA-Z0-9]+)/);
                    if (streamableMatch) {
                        return (
                            <iframe
                                src={`https://streamable.com/e/${streamableMatch[1]}?autoplay=1`}
                                title="Streamable video"
                                allowFullScreen
                                style={{ width: '100%', height: '100%', border: 'none' }}
                            />
                        );
                    }
                    return <video src={url} controls autoPlay style={{ width: '100%', height: '100%' }} />;
                };

                const isYoutube = video.url.includes('youtube.com') || video.url.includes('youtu.be');

                return (
                    <div
                        key={video.id}
                        className={`gallery-item ${isExpanded ? 'expanded' : ''}`}
                        style={{ aspectRatio: isExpanded ? '16/9' : '1' }}
                    >
                        {isExpanded ? (
                            renderVideoEmbed(video.url)
                        ) : (
                            <div className="gallery-video-thumb" onClick={() => setExpandedVideo(video.id)}>
                                {video.thumb ? (
                                    <img src={video.thumb} alt={video.title} loading="lazy" />
                                ) : !isYoutube ? (
                                    <VideoThumbnail src={video.url} />
                                ) : (
                                    <div style={{ width: '100%', height: '100%', background: '#333' }} />
                                )}
                                <div className="gallery-play-overlay">
                                    {isYoutube ? (
                                        <div className="youtube-symbol" />
                                    ) : (
                                        <span className="gallery-play-icon">▶</span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

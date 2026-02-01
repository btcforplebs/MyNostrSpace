import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { Navbar } from '../Shared/Navbar';
import './BrowsePage.css';

interface BrowseProfile {
    pubkey: string;
    name?: string;
    picture?: string;
}

interface ExternalLink {
    name: string;
    url: string;
}

const POPULAR_SITES: ExternalLink[] = [
    { name: "Damus", url: "https://damus.io" },
    { name: "Amethyst", url: "https://github.com/vitorpamplona/amethyst" },
    { name: "Snort", url: "https://snort.social" },
    { name: "Primal", url: "https://primal.net" },
    { name: "Nostr.band", url: "https://nostr.band" },
    { name: "Nostr.watch", url: "https://nostr.watch" },
];

const NoteMedia = ({ content }: { content: string }) => {
    // Simple regex to find the first URL
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = content.match(urlRegex);

    if (!match) return null;

    const url = match[0];
    const extension = url.split('.').pop()?.toLowerCase();

    // Image
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) {
        return (
            <div style={{ marginTop: '10px', textAlign: 'center' }}>
                <img src={url} alt="Note Attachment" style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain' }} />
            </div>
        );
    }

    // Video
    if (['mp4', 'mov', 'webm'].includes(extension || '')) {
        return (
            <div style={{ marginTop: '10px', textAlign: 'center' }}>
                <video src={url} controls style={{ maxWidth: '100%', maxHeight: '300px' }} />
            </div>
        );
    }

    // YouTube
    if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
        let videoId = null;
        if (url.includes('v=')) {
            videoId = url.split('v=')[1]?.split('&')[0];
        } else if (url.includes('youtu.be/')) {
            videoId = url.split('youtu.be/')[1]?.split('?')[0];
        }

        if (videoId) {
            return (
                <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <iframe
                        width="100%"
                        height="200"
                        src={`https://www.youtube.com/embed/${videoId}`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="Embedded Video"
                    ></iframe>
                </div>
            );
        }
    }

    return null;
};


export const BrowsePage = () => {
    const { ndk } = useNostr();
    const [profiles, setProfiles] = useState<BrowseProfile[]>([]);
    const [recentNotes, setRecentNotes] = useState<NDKEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!ndk) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Fetch Profiles (Kind 0)
                const profileEvents = await ndk.fetchEvents({ kinds: [0], limit: 50 });
                const uniquePubkeys = new Set();
                const processedProfiles: BrowseProfile[] = [];
                const sortedProfiles = Array.from(profileEvents).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

                for (const event of sortedProfiles) {
                    if (uniquePubkeys.has(event.pubkey)) continue;
                    uniquePubkeys.add(event.pubkey);
                    try {
                        const content = JSON.parse(event.content);
                        if (!content.name && !content.picture && !content.display_name) continue;
                        processedProfiles.push({
                            pubkey: event.pubkey,
                            name: content.name || content.display_name,
                            picture: content.picture,
                        });
                    } catch (e) { /* ignore */ }
                    if (processedProfiles.length >= 8) break; // Limit to 8 for 4x2 grid
                }
                setProfiles(processedProfiles);

                // 2. Fetch "Popular" Notes (Kind 1, filtered for top-level)
                // Fetch more initially to allow for filtering
                const noteFilter: NDKFilter = { kinds: [1], limit: 100 };
                const noteEvents = await ndk.fetchEvents(noteFilter);

                // Filter out replies (events with 'e' tags) and sort new to old
                const notesArray = Array.from(noteEvents)
                    .filter(event => !event.tags.some(tag => tag[0] === 'e'))
                    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
                    .slice(0, 20); // Take top 20 recent top-level posts

                await Promise.all(notesArray.map(n => n.author.fetchProfile()));

                setRecentNotes(notesArray);

            } catch (err) {
                console.error("Browse fetch failed", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [ndk]);

    return (
        <div className="browse-page-container">
            <div className="browse-header-area">
                <Navbar />
            </div>
            <div className="browse-layout">
                {/* Left Column: People to Friend & Popular Sites */}
                <div className="browse-left-column">
                    <h2 className="section-header">People to Friend</h2>
                    <div className="browse-people-grid" style={{ marginBottom: '20px' }}>
                        {profiles.map((profile) => (
                            <div key={profile.pubkey} className="browse-profile-card">
                                <Link to={`/p/${profile.pubkey}`}>
                                    {profile.picture ? (
                                        <img src={profile.picture} alt={profile.name} className="browse-profile-pic" />
                                    ) : (
                                        <div className="browse-profile-pic" style={{ background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</div>
                                    )}
                                </Link>
                                <Link to={`/p/${profile.pubkey}`} className="browse-profile-name">
                                    {profile.name || "User"}
                                </Link>
                            </div>
                        ))}
                    </div>

                    <h2 className="section-header">Popular Nostr Sites</h2>
                    <ul className="popular-sites-list">
                        {POPULAR_SITES.map(site => (
                            <li key={site.url}>
                                <a href={site.url} target="_blank" rel="noopener noreferrer">{site.name}</a>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Right Column: Popular Notes */}
                <div className="browse-right-column">
                    <h2 className="section-header">Popular Notes</h2>
                    {loading && <div>Loading stream...</div>}

                    <div className="browse-notes-list">
                        {recentNotes.map(note => (
                            <div key={note.id} className="browse-note-item">
                                <div className="browse-note-header">
                                    <Link to={`/p/${note.pubkey}`} style={{ color: '#003399' }}>
                                        {note.author.profile?.name || note.pubkey.slice(0, 8)}
                                    </Link>
                                    <span style={{ fontWeight: 'normal', marginLeft: '5px', fontSize: '8pt', color: '#666' }}>
                                        {new Date((note.created_at || 0) * 1000).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="browse-note-content">
                                    {note.content.length > 280 ? note.content.slice(0, 280) + '...' : note.content}
                                    <NoteMedia content={note.content} />
                                </div>
                            </div>
                        ))}
                        {!loading && recentNotes.length === 0 && <div>No notes found.</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};

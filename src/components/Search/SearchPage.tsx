import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';

interface SearchResult {
    pubkey: string;
    name?: string;
    picture?: string;
    about?: string;
    nip05?: string;
}

export const SearchPage = () => {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const { ndk } = useNostr();
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!query || !ndk) return;

        const searchProfiles = async () => {
            setLoading(true);
            try {
                // NIP-50 Search
                const events = await ndk.fetchEvents({
                    kinds: [0],
                    search: query,
                    limit: 20,
                });

                const profiles: SearchResult[] = Array.from(events).map((event) => {
                    let profile: any = {};
                    try {
                        profile = JSON.parse(event.content);
                    } catch (e) {
                        // ignore malformed content
                    }
                    return {
                        pubkey: event.pubkey,
                        name: profile.name || profile.display_name,
                        picture: profile.picture,
                        about: profile.about,
                        nip05: profile.nip05
                    };
                });

                setResults(profiles);
            } catch (err) {
                console.error("Search failed", err);
            } finally {
                setLoading(false);
            }
        };

        searchProfiles();
    }, [query, ndk]);

    return (
        <div className="search-page-container" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <h2 className="section-header">Search Results for "{query}"</h2>

            {loading && <div style={{ padding: '20px', textAlign: 'center' }}>Searching the cosmos...</div>}

            {!loading && results.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center' }}>No results found. Try a different term.</div>
            )}

            <div className="search-results-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginTop: '20px' }}>
                {results.map((profile) => (
                    <div key={profile.pubkey} className="friend-card" style={{
                        border: '1px solid #ccc',
                        background: '#fff',
                        padding: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        <div style={{ width: '60px', height: '60px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid #eee' }}>
                            {profile.picture ? (
                                <img src={profile.picture} alt={profile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', background: '#ddd' }}></div>
                            )}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                            <Link to={`/p/${profile.nip05 || profile.name || profile.pubkey}`} style={{ fontWeight: 'bold', fontSize: '14px', textDecoration: 'none', color: '#003399' }}>
                                {profile.name || profile.pubkey.slice(0, 8)}
                            </Link>
                            {profile.nip05 && <div style={{ fontSize: '11px', color: '#666' }}>{profile.nip05}</div>}
                            {profile.about && (
                                <div style={{ fontSize: '12px', color: '#333', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {profile.about}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

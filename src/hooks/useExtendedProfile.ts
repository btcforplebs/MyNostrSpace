import { useEffect, useState } from 'react';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import { useNostr } from '../context/NostrContext';
import { getCachedData, setCachedData } from '../utils/cache';

export interface ExtendedProfileData {
    headline?: string;
    gender?: string;
    city?: string;
    region?: string; // State/Province
    country?: string;
    mainClient?: string;

    bitcoinerSince?: string;
    music?: {
        title: string;
        url: string; // Wavlake or Blossom URL
        link?: string; // External link (e.g. Wavlake track page)
    }[] | { title: string; url: string; link?: string }; // Array for playlist, object for legacy/single
    interests?: {
        general?: string;
        music?: string;
        movies?: string;
        television?: string;
        books?: string;
        heroes?: string;
    };
    themeUrl?: string; // Blossom URL for CSS
}

export const useExtendedProfile = (pubkey?: string) => {
    const { ndk } = useNostr();
    const [data, setData] = useState<ExtendedProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [event, setEvent] = useState<NDKEvent | null>(null);

    useEffect(() => {
        if (!pubkey || !ndk) return;

        const fetchExtendedProfile = async () => {
            // Check cache
            const cached = getCachedData<ExtendedProfileData>(`extended_${pubkey}`);
            if (cached) {
                setData(cached);
                setLoading(false);
            }

            setLoading(!cached);
            try {
                let hexPubkey = pubkey;
                if (pubkey.startsWith('npub') || pubkey.startsWith('nprofile')) {
                    const tempUser = ndk.getUser({
                        [pubkey.startsWith('npub') ? 'npub' : 'nprofile']: pubkey
                    });
                    hexPubkey = tempUser.pubkey;
                }

                // Fetch Parameterized Replaceable Event
                const e = await ndk.fetchEvent({
                    kinds: [30001 as NDKKind],
                    authors: [hexPubkey],
                    '#d': ['mynostrspace_v1']
                });

                if (e) {
                    setEvent(e);
                    try {
                        const parsed = JSON.parse(e.content);
                        setData(parsed);
                        setCachedData(`extended_${pubkey}`, parsed);
                    } catch (err) {
                        console.error('Failed to parse extended profile content', err);
                    }
                } else {
                    setData(null);
                }
            } catch (e) {
                console.error('Error fetching extended profile', e);
            } finally {
                setLoading(false);
            }
        };

        fetchExtendedProfile();
    }, [ndk, pubkey]);

    const publish = async (newData: ExtendedProfileData) => {
        if (!ndk) return;

        const e = new NDKEvent(ndk);
        e.kind = 30001 as NDKKind;
        e.content = JSON.stringify(newData);
        e.tags = [['d', 'mynostrspace_v1']];

        await e.publish();
        setData(newData);
        setEvent(e);
    };

    return { data, loading, publish, event };
};

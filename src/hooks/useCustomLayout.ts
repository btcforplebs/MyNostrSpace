import { useEffect, useState } from 'react';
import { useNostr } from '../context/NostrContext';

export const useCustomLayout = (pubkey?: string) => {
    const { ndk } = useNostr();
    const [layoutUrl, setLayoutUrl] = useState<string | null>(null);
    const [layoutCss, setLayoutCss] = useState<string | null>(null);

    useEffect(() => {
        if (!ndk || !pubkey) return;

        const fetchLayout = async () => {
            try {
                let hexPubkey = pubkey;
                if (pubkey.startsWith('npub') || pubkey.startsWith('nprofile')) {
                    const tempUser = ndk.getUser({
                        [pubkey.startsWith('npub') ? 'npub' : 'nprofile']: pubkey
                    });
                    hexPubkey = tempUser.pubkey;
                }

                // Fetch Kind 30078 with d=mynostrspace_layout
                const event = await ndk.fetchEvent({
                    kinds: [30078 as number],
                    authors: [hexPubkey],
                    '#d': ['mynostrspace_layout']
                });

                if (event) {
                    // 1. Check direct content (preferred for CSS editor)
                    if (event.content && event.content.trim().length > 0) {
                        setLayoutCss(event.content);
                    }
                    // 2. Fallback to URL tag if content is empty
                    else {
                        const url = event.tags.find(t => t[0] === 'url')?.[1];
                        if (url) {
                            setLayoutUrl(url);
                            // Fetch the content immediately to inject
                            const res = await fetch(url);
                            const txt = await res.text();
                            setLayoutCss(txt);
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to fetch custom layout", e);
            }
        };

        fetchLayout();
    }, [ndk, pubkey]);

    return { layoutUrl, layoutCss };
};

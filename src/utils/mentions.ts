import { nip19 } from 'nostr-tools';

/**
 * Extracts unique hex pubkeys from content containing nostr:npub... or nostr:nprofile...
 * Used to add 'p' tags to events.
 */
export const extractMentions = (content: string): string[] => {
    const mentions = new Set<string>();

    // Match nostr:npub... and nostr:nprofile...
    const matches = content.matchAll(/nostr:((npub|nprofile)1[a-z0-9]+)/g);

    for (const match of matches) {
        try {
            const entity = match[1];
            const decoded = nip19.decode(entity);

            if (decoded.type === 'npub') {
                mentions.add(decoded.data as string);
            } else if (decoded.type === 'nprofile') {
                mentions.add(decoded.data.pubkey);
            }
        } catch (e) {
            console.warn('Failed to decode potential mention:', match[0], e);
        }
    }

    return Array.from(mentions);
};

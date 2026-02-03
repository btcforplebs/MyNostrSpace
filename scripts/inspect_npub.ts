import NDK, { NDKRelaySet, NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import 'websocket-polyfill';

const npub = 'npub16ucdkrgndlnpa8aupwc8rs9j2nltpu5n6mejkzjd2wtqwajd6xuqvqe3qq';
const relays = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://hist.nostr.land'];

async function main() {
    const ndk = new NDK({ explicitRelayUrls: relays });
    await ndk.connect();

    const user = ndk.getUser({ npub });
    await user.fetchProfile();
    console.log('Profile:', user.profile?.name, user.profile?.about);

    console.log('Fetching events...');

    // Fetch kinds that might be relevant: 
    // 1 (text note), 30023 (long form), 1063 (file metadata), 30024 (list)
    const filter = {
        authors: [user.pubkey],
        kinds: [1, 1063, 30023, 30024],
        limit: 10
    };

    const events = await ndk.fetchEvents(filter);

    console.log(`Found ${events.size} events.`);

    for (const event of events) {
        console.log('---');
        console.log('Kind:', event.kind);
        console.log('Content (snippet):', event.content.substring(0, 100));
        console.log('Tags:', event.tags);
    }

    process.exit(0);
}

main().catch(console.error);

import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';
import 'websocket-polyfill';

const npub = 'npub16ucdkrgndlnpa8aupwc8rs9j2nltpu5n6mejkzjd2wtqwajd6xuqvqe3qq';
const relays = [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.snort.social'
];

async function main() {
    const ndk = new NDK({ explicitRelayUrls: relays });
    await ndk.connect();

    const user = ndk.getUser({ npub });
    await user.fetchProfile();
    console.log(`Analyzing events for ${user.profile?.name || 'Unknown'} (${npub})`);

    const filter = {
        authors: [user.pubkey],
        limit: 500 // Fetch a good chunk to see distribution
    };

    console.log('Fetching events...');
    const events = await ndk.fetchEvents(filter);
    console.log(`Fetched ${events.size} events.`);

    const kindCounts: Record<number, number> = {};
    const kindSamples: Record<number, NDKEvent> = {};

    for (const event of events) {
        kindCounts[event.kind!] = (kindCounts[event.kind!] || 0) + 1;
        if (!kindSamples[event.kind!]) {
            kindSamples[event.kind!] = event;
        }
    }

    console.log('Event Kind Distribution:');
    for (const [kind, count] of Object.entries(kindCounts)) {
        console.log(`Kind ${kind}: ${count} events`);
    }

    console.log('\n--- Samples ---');
    for (const kind of Object.keys(kindSamples)) {
        const event = kindSamples[parseInt(kind)];
        console.log(`\n[Kind ${kind}]`);
        console.log('Tags:', event.tags);
        console.log('Content snippet:', event.content.substring(0, 200));
    }

    process.exit(0);
}

main().catch(console.error);

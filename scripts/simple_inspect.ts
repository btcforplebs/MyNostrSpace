import { SimplePool, nip19 } from 'nostr-tools';
import 'websocket-polyfill';

const npub = 'npub16ucdkrgndlnpa8aupwc8rs9j2nltpu5n6mejkzjd2wtqwajd6xuqvqe3qq';
const { data: pubkey } = nip19.decode(npub);

const relays = ['wss://relay.nostr.band', 'wss://relay.damus.io'];

async function main() {
    const pool = new SimplePool();

    console.log(`Fetching events for pubkey: ${pubkey}`);

    const events = await pool.querySync(relays, {
        authors: [pubkey as string],
        kinds: [1, 1063, 30023],
        limit: 50
    });

    console.log(`Found ${events.length} events.`);

    events.forEach(e => {
        console.log(`\n[Kind ${e.kind}]`);
        console.log(`Content: ${e.content.substring(0, 100)}...`);
        console.log(`Tags:`, e.tags);
    });

    pool.close(relays);
    process.exit(0);
}

main().catch(console.error);

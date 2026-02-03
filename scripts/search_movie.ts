import { SimplePool } from 'nostr-tools';
import 'websocket-polyfill';

const relays = [
    'wss://relay.nostr.band',
    'wss://search.nos.lol',
    'wss://relay.damus.io'
];

async function main() {
    const pool = new SimplePool();
    console.log('Searching for "The Chronicles Of Riddick"...');

    // Kind 1 (Note), 30023 (Article), 1063 (File Header)
    const events = await pool.querySync(relays, {
        search: "The Chronicles Of Riddick",
        limit: 10
    });

    console.log(`Found ${events.length} events matching search.`);

    events.forEach(e => {
        console.log(`\n[Kind ${e.kind}] Author: ${e.pubkey}`);
        console.log(`Content: ${e.content.substring(0, 150)}...`);
        console.log('Tags:', e.tags);
    });

    process.exit(0);
}

main().catch(console.error);

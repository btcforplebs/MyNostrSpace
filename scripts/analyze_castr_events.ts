import { SimplePool, nip19 } from 'nostr-tools';
import 'websocket-polyfill';

const npub = 'npub1tn2lspfvv7g7fpulpexmjy6xt4c36h6lurq2hxgyn3sxf3drjk3qrchmc3';
const { data: pubkey } = nip19.decode(npub);

const relays = [
    'wss://relay.nostr.band',
    'wss://relay.damus.io',
    'wss://nos.lol'
];

async function main() {
    const pool = new SimplePool();
    console.log(`Fetching events for pubkey: ${pubkey} (${npub})`);

    // Fetch Text Notes (1), File Headers (1063), Long Form (30023)
    const events = await pool.querySync(relays, {
        authors: [pubkey as string],
        kinds: [1, 1063, 30023],
        limit: 20
    });

    console.log(`Found ${events.length} events.`);

    events.forEach(e => {
        console.log(`\n[Kind ${e.kind}]`);
        console.log(`Content: ${e.content.substring(0, 200)}...`);
        console.log(`Tags:`, e.tags);
    });

    // Also try to find specifically "Pitch Black" if not found in first batch
    if (!events.find(e => e.content.includes("Pitch Black"))) {
        console.log("\nSearching specifically for 'Pitch Black'...");
        const searchEvents = await pool.querySync(relays, {
            authors: [pubkey as string],
            search: "Pitch Black",
            limit: 5
        });
        searchEvents.forEach(e => {
            console.log(`\n[Found Search Match Kind ${e.kind}]`);
            console.log(`Content: ${e.content.substring(0, 200)}`);
        });
    }

    process.exit(0);
}

main().catch(console.error);

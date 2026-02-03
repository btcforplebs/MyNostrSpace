import { nip19 } from 'nostr-tools';
import NDK from '@nostr-dev-kit/ndk';

const targetNaddr = 'naddr1qvzqqqrkvupzpn6956apxcad0mfp8grcuugdysg44eepex68h50t73zcathmfs49qqjrvvrzx3skvcej95mrvctr956r2cfs943rsdf394jnsdfsxgunzvn9xf3xycussav';

async function main() {
    try {
        const decoded = nip19.decode(targetNaddr);
        console.log('Decoded type:', decoded.type);
        console.log('Decoded data:', decoded.data);

        if (decoded.type === 'naddr') {
            const { pubkey, kind, identifier, relays } = decoded.data;
            console.log(`Pubkey: ${pubkey}`);
            console.log(`Kind: ${kind}`);
            console.log(`Identifier (d tag): ${identifier}`);
            console.log(`Relays in naddr:`, relays);

            // Now try to fetch with NDK using this info
            const ndk = new NDK({
                explicitRelayUrls: relays && relays.length > 0 ? relays : [
                    'wss://relay.zap.stream',
                    'wss://nos.lol',
                    'wss://relay.damus.io',
                    'wss://relay.snort.social',
                    'wss://relay.nostr.band',
                    'wss://purplepag.es',
                    'wss://relay.primal.net',
                    'wss://relay.current.fyi'
                ]
            });

            await ndk.connect();
            console.log('NDK Connected');

            // 1. Fetch user's relay list to see where they publish
            console.log('Fetching relay list (kind 10002)...');
            const relayList = await ndk.fetchEvent({ kinds: [10002], authors: [pubkey] });

            let targetRelays = new Set<string>(['wss://relay.zap.stream', 'wss://nos.lol']);
            if (relayList) {
                console.log('Found relay list!');
                relayList.tags.forEach(t => {
                    if (t[0] === 'r') {
                        targetRelays.add(t[1]);
                        console.log('User relay:', t[1]);
                    }
                });
            }

            // Re-connect with user relays
            const ndk2 = new NDK({ explicitRelayUrls: Array.from(targetRelays) });
            await ndk2.connect();

            const filter = {
                kinds: [kind || 30311],
                authors: [pubkey],
                '#d': [identifier]
            };

            console.log('Fetching stream event with filter:', filter);
            const event = await ndk2.fetchEvent(filter);

            if (event) {
                console.log('FOUND EVENT');
                console.log('Relay:', event.relay?.url);
                console.log('Tags:', event.tags);
                const status = event.tags.find(t => t[0] === 'status');
                console.log('Status tag:', status);
            } else {
                console.log('Event not found on user relays.');
            }
        }
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

main();

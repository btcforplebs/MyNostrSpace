
import NDK, { NDKKind } from '@nostr-dev-kit/ndk';
import 'websocket-polyfill';

const ndk = new NDK({
    explicitRelayUrls: [
        'wss://relay.damus.io',
        'wss://relay.primal.net',
        'wss://nos.lol',
        'wss://relay.zap.stream'
    ]
});

const PINNED_PUBKEY = 'cf45a6ba1363ad7ed213a078e710d24115ae721c9b47bd1ebf4458eaefb4c2a5';
const PINNED_D_TAG = '537a365c-f1ec-44ac-af10-22d14a7319fb';

async function verify() {
    await ndk.connect();
    console.log("Connected to relays.");

    const filter = {
        kinds: [30311 as NDKKind],
        authors: [PINNED_PUBKEY],
        '#d': [PINNED_D_TAG]
    };

    console.log("Fetching event with filter:", filter);
    const event = await ndk.fetchEvent(filter);

    if (event) {
        console.log("EVENT FOUND!");
        console.log("ID:", event.id);
        console.log("Kind:", event.kind);
        console.log("Pubkey:", event.pubkey);
        console.log("Tags:", event.tags);

        const status = event.getMatchingTags('status')[0]?.[1];
        console.log("STATUS:", status);
    } else {
        console.log("EVENT NOT FOUND on these relays.");
    }
}

verify();

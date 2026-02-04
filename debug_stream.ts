import NDK from '@nostr-dev-kit/ndk';

// The specific naddr from the user
const targetNaddr =
  'naddr1qvzqqqrkvupzpn6956apxcad0mfp8grcuugdysg44eepex68h50t73zcathmfs49qqjrvvrzx3skvcej95mrvctr956r2cfs943rsdf394jnsdfsxgunzvn9xf3xycussav';

async function main() {
  const ndk = new NDK({
    explicitRelayUrls: [
      'wss://relay.zap.stream',
      'wss://nos.lol',
      'wss://relay.damus.io',
      'wss://relay.highlighter.com',
      'wss://relay.nostr.band',
    ],
  });

  await ndk.connect();

  console.log('Searching for event:', targetNaddr);

  try {
    // NDK can fetch by naddr directly usually, or we can decode it.
    // fetching by string reference
    const event = await ndk.fetchEvent(targetNaddr);

    if (event) {
      console.log('FOUND EVENT!');
      console.log('ID:', event.id);
      console.log('Kind:', event.kind);
      console.log('Author:', event.pubkey);
      console.log('Tags:', event.tags);
      console.log('Content:', event.content.slice(0, 100)); // Log first 100 chars
      // Attempt to find which relay it came from if NDK exposes it on the event
      console.log('Relay:', event.relay?.url);
    } else {
      console.log('Event NOT FOUND in current relay set.');
    }
  } catch (e) {
    console.error('Error fetching event:', e);
  }

  process.exit(0);
}

main();

import NDK, { NDKEvent, NDKPrivateKeySigner, NDKUser } from '@nostr-dev-kit/ndk';
import 'websocket-polyfill';

async function main() {
  const bunkerUrl = process.argv[2];
  if (!bunkerUrl) {
    console.error('Usage: npx tsx scripts/test_nip46.ts <bunker-url>');
    process.exit(1);
  }

  console.log('Testing NIP-46 with URL:', bunkerUrl);

  // Parse bunker URL
  let targetPubkey = '';
  let relayUrls: string[] = [];
  let secret: string | null = null;
  try {
    const url = new URL(bunkerUrl);
    targetPubkey = url.hostname || url.pathname.replace(/^\/\//, '');
    const params = new URLSearchParams(url.search);
    relayUrls = params.getAll('relay');
    secret = params.get('secret');
  } catch (e) {
    console.error('Failed to parse bunker URL', e);
    process.exit(1);
  }

  console.log('Target Pubkey:', targetPubkey);
  console.log('Relays:', relayUrls);
  if (secret) console.log('Secret found in URL (will be included in connect request)');

  if (!targetPubkey) {
    console.error('Could not extract target pubkey from bunker URL');
    process.exit(1);
  }

  const ndk = new NDK({
    explicitRelayUrls: relayUrls,
  });

  // Add detailed listeners to relays
  relayUrls.forEach((url) => {
    const relay = ndk.pool.getRelay(url);
    relay.on('connect', () => console.log(`✅ Event: Connected to ${url}`));
    relay.on('disconnect', () => console.log(`❌ Event: Disconnected from ${url}`));
    // @ts-expect-error - NDK relay error event type mismatch
    relay.on('error', (err: unknown) => console.log(`❗ Event: Error from ${url}:`, err));
    relay.on('notice', (msg: string) => console.log(`📢 Event: Notice from ${url}: ${msg}`));
  });

  console.log('Connecting to NDK (5s timeout)...');
  await ndk.connect(5000);

  // Check connectivity
  let connectedCount = 0;
  for (const [, relay] of ndk.pool.relays) {
    if (relay.status === 1 || relay.status === 5) {
      connectedCount++;
    }
  }

  if (connectedCount === 0) {
    console.error('CRITICAL: No relays connected.');
    process.exit(1);
  }

  // Manual NIP-46 Connect Flow
  const localSigner = NDKPrivateKeySigner.generate();
  const localUser = await localSigner.user();

  // IMPORTANT: Set signer on NDK instance so encryption works
  ndk.signer = localSigner;

  console.log('Local Pubkey:', localUser.pubkey);

  // 1. Subscribe to responses FIRST
  console.log('Subscribing to response events (Kind 24133)...');
  const sub = ndk.subscribe(
    {
      kinds: [24133],
      '#p': [localUser.pubkey],
    },
    { closeOnEose: false }
  );

  sub.on('event', (event) => {
    console.log('!! RECEIVED RESPONSE !!', event.rawEvent());
    console.log('Content:', event.content);
    process.exit(0);
  });

  // 2. Publish Connect Request
  console.log("Constructing 'connect' request...");
  const reqEvent = new NDKEvent(ndk);
  reqEvent.kind = 24133;
  reqEvent.tags = [['p', targetPubkey]];

  // NIP-46 connect payload
  // Research suggests first param should be the TARGET pubkey (the one we want to control)
  const connectParams = [targetPubkey];
  if (secret) {
    connectParams.push(secret);
  }

  const payload = {
    id: Math.random().toString(36).substring(7),
    method: 'connect',
    params: connectParams,
  };

  console.log('Encrypting payload:', JSON.stringify(payload));

  try {
    const recipientUser = new NDKUser({ pubkey: targetPubkey });
    const encrypted = await localSigner.encrypt(recipientUser, JSON.stringify(payload));
    console.log('Encryption successful.');
    reqEvent.content = encrypted;
  } catch (e) {
    console.error('Encryption failed:', e);
    process.exit(1);
  }

  console.log('Signing event...');
  await reqEvent.sign(localSigner);

  console.log('Publishing event...', reqEvent.rawEvent());
  try {
    const pubs = await reqEvent.publish();
    console.log(`Published to ${pubs.size} relays.`);
  } catch (e) {
    console.error('Failed to publish:', e);
  }

  console.log('Waiting for response (press Ctrl+C to stop)...');
}

main().catch(console.error);

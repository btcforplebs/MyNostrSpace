import { NDKPrivateKeySigner, NDKNip46Signer, NDKEvent } from '@nostr-dev-kit/ndk';
import NDK from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

/**
 * standalone-bunker-test.ts
 * Run this to see EXACTLY what's happening on the wire.
 */

async function testBunker(connectionString: string) {
  console.log('--- BOKER DIAGNOSTIC START ---');
  console.log('URI:', connectionString);

  // Parse
  let targetPubkey = '';
  let relays: string[] = [];
  try {
    const url = new URL(connectionString);
    targetPubkey = url.hostname || url.pathname.replace(/^\/\//, '');
    if (targetPubkey.startsWith('npub1')) {
      targetPubkey = nip19.decode(targetPubkey).data as string;
    }
    console.log('Target Pubkey (hex):', targetPubkey);

    relays = url.searchParams.getAll('relay');
    console.log('Relays from URI:', relays);
  } catch (e) {
    console.error('Critical: Failed to parse URI', e);
    return;
  }

  // Initialize NDK WITH the relays from the start
  const ndk = new NDK({
    explicitRelayUrls: relays,
  });

  console.log('Triggering NDK connect...');
  ndk.connect(2000).catch((e) => console.log('NDK connect background error:', e.message));

  console.log('\n--- RELAY CONNECTIVITY CHECK ---');
  const waitStart = Date.now();
  let atLeastOneConnected = false;

  while (Date.now() - waitStart < 15000) {
    const statuses: string[] = [];
    let connectedCount = 0;

    for (const url of relays) {
      const normalizedUrl = url.endsWith('/') ? url : url + '/';
      const relay = ndk.pool.relays.get(url) || ndk.pool.relays.get(normalizedUrl);

      if (relay) {
        // NDK states: 0=DISCONNECTED, 1=CONNECTING, 2=CONNECTED, 3=FLAPPING, 4=PERMANENT_FAILURE, 5=RECONNECTING
        const statusNum = relay.status;
        const isConnected = statusNum === 2 || (statusNum as unknown as number) === 5;
        statuses.push(`${url}: ${isConnected ? '✅ CONNECTED' : '❌ ' + statusNum}`);
        if (isConnected) connectedCount++;
        else relay.connect().catch(() => {});
      } else {
        statuses.push(`${url}: ❓ NOT IN POOL`);
      }
    }

    console.log(`[${Math.floor((Date.now() - waitStart) / 1000)}s] ` + statuses.join(' | '));

    if (connectedCount > 0) {
      atLeastOneConnected = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!atLeastOneConnected) {
    console.warn('\nFATAL: Zero bunker relays connected after 15s. Handshake will likely fail.');
  } else {
    console.log('\nConnectivity established. Proceeding to handshake.');
  }

  const localSigner = NDKPrivateKeySigner.generate();
  const localUser = await localSigner.user();
  console.log('Local Client Pubkey:', localUser.pubkey);

  const remoteSigner = new NDKNip46Signer(ndk, connectionString, localSigner);

  // MANUAL OVERRIDE: Ensure the signer uses the EXACT relay URLs from the pool
  // This stops NDK from trying to connect to "new" variants like with/without slashes
  remoteSigner.relayUrls = Array.from(ndk.pool.relays.keys());
  console.log(
    'Signer relayUrls overridden with pool keys:',
    (remoteSigner as unknown as { relayUrls: string[] }).relayUrls
  );

  // 5. WIRE SNOOP: Listen for EVERY NIP-46 event on these relays (no filters!)
  console.log('\n--- STARTING WIRE SNOOP (ALL Kind 24133) ---');
  const snoopSub = ndk.subscribe(
    {
      kinds: [24133],
    },
    { closeOnEose: false }
  );

  snoopSub.on('event', (event) => {
    const isToMe = event.getMatchingTags('p')[0]?.[1] === localUser.pubkey;
    const isFromBunker = event.pubkey === targetPubkey;

    console.log(
      `\n[WIRE] Kind 24133 | From: ${event.pubkey.slice(0, 8)}... | To: ${event.getMatchingTags('p')[0]?.[1]?.slice(0, 8)}...`
    );
    if (isToMe) console.log('      ^^^ THIS IS FOR ME!');
    if (isFromBunker) console.log('      ^^^ THIS IS FROM THE BUNKER!');
    console.log('      ID:', event.id);
    console.log('      Content:', event.content);
  });

  // 6. Manual RPC Connect Test
  try {
    console.log("\n--- MANUAL RPC 'connect' TEST ---");
    const url = new URL(connectionString);
    const secret = url.searchParams.get('secret') || '';

    console.log('Triggering manual RPC connect call (Raw Kind 24133)...');

    // Construct the RPC request
    const rpcRequest = {
      id: Math.random().toString(36).substring(7),
      method: 'connect',
      params: [localUser.pubkey, secret],
    };

    // Encrypt with NIP-04 (most common for 'connect')
    const content = await localSigner.encrypt(
      await ndk.getUser({ pubkey: targetPubkey }),
      JSON.stringify(rpcRequest)
    );

    const event = new NDKEvent(ndk);
    event.kind = 24133;
    event.content = content;
    event.tags = [['p', targetPubkey]];
    await event.sign(localSigner);

    console.log(`Publishing manual connect event ${event.id.slice(0, 8)}...`);
    await event.publish();
    console.log('✅ Manual connect event published. Watching WIRE SNOOP for response...');
  } catch (e: unknown) {
    console.warn('❌ MANUAL CONNECT TEST FAILED:', e instanceof Error ? e.message : String(e));
  }

  // 7. Handshake with 60s timeout
  try {
    console.log('\n--- STARTING blockUntilReady (Official NDK Handshake) ---');
    await Promise.race([
      remoteSigner.blockUntilReady(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('60s Timeout reached')), 60000)),
    ]);
    console.log('\nSUCCESS: Signer ready!');
  } catch (e: unknown) {
    console.error('\nFAILED:', e instanceof Error ? e.message : String(e));
  } finally {
    snoopSub.stop();
    // Wait a sec for final logs
    await new Promise((r) => setTimeout(r, 2000));
    process.exit();
  }
}

const uri = process.argv[2];
if (!uri) {
  console.error('Usage: npx ts-node standalone-bunker-test.ts <bunker-uri>');
  process.exit(1);
}

testBunker(uri);

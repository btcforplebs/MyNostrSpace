import NDK, { NDKPrivateKeySigner, NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { nip19, nip04 } from 'nostr-tools';

/**
 * raw_handshake.ts
 * MANUALLY performs the NIP-46 'connect' handshake without the NDKSigner abstraction.
 * This is the ultimate ground-truth test.
 */

async function rawHandshake(connectionString: string) {
  console.log('--- RAW PROTOCOL DIAGNOSTIC ---');

  // 1. Parse URI
  const url = new URL(connectionString);
  const targetPubkey = url.hostname || url.pathname.replace(/^\/\//, '');
  const relays = url.searchParams.getAll('relay');
  const secret = url.searchParams.get('secret') || '';

  const hexTarget = targetPubkey.startsWith('npub1')
    ? (nip19.decode(targetPubkey).data as string)
    : targetPubkey;

  console.log('Target Bunker:', hexTarget);
  console.log('Relays from URI:', relays);
  console.log('Secret:', secret ? 'PRESENT' : 'MISSING');

  // 2. Initialize NDK
  const ndk = new NDK({ explicitRelayUrls: relays });
  await ndk.connect(5000);
  console.log('Connected to relays.');

  // 2.5 PRESENCE CHECK: Can we see this bunker on the network?
  console.log('\n--- BUNKER PRESENCE CHECK ---');
  const bunkerUser = ndk.getUser({ pubkey: hexTarget });
  const profile = await bunkerUser
    .fetchProfile({ cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY })
    .catch(() => null);
  if (profile) {
    console.log('✅ Bunker Metadata found!');
    console.log('   Name:', profile.name || 'Unknown');
    console.log('   NIP-05:', profile.nip05 || 'None');
  } else {
    console.warn('⚠️ Bunker Metadata NOT FOUND. (Is it online?)');
  }

  const relayList = await ndk.fetchEvents(
    {
      kinds: [10002],
      authors: [hexTarget],
    },
    { cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY }
  );

  if (relayList.size > 0) {
    console.log('✅ Bunker Relay List (Kind 10002) found!');
    const tags = Array.from(relayList)[0].tags;
    tags
      .filter((t) => t[0] === 'r')
      .forEach((t) => console.log(`   Relay: ${t[1]} (${t[2] || 'rw'})`));
  } else {
    console.log('ℹ️ No explicit relay list (10002) found for bunker.');
  }

  // 3. Setup Local Signer
  const localSigner = NDKPrivateKeySigner.generate();
  const localUser = await localSigner.user();
  console.log('Local Client Pubkey:', localUser.pubkey);

  // 4. Wire Snoop (Background)
  const sub = ndk.subscribe(
    {
      kinds: [24133],
      '#p': [localUser.pubkey],
    },
    { closeOnEose: false }
  );

  sub.on('event', async (event) => {
    console.log('\n!!! INCOMING EVENT DETECTED !!!');
    console.log('From:', event.pubkey);
    try {
      // NIP-46 specifies NIP-04 encryption
      const decrypted = await nip04.decrypt(localSigner.privateKey!, event.pubkey, event.content);
      console.log('Decrypted Content:', JSON.parse(decrypted));
    } catch (e) {
      console.warn('Failed to decrypt incoming content (NIP-04 failure):', e.message);
    }
  });

  // 5. Construct Manual 'connect' RPC
  const requestId = Math.random().toString(36).substring(7);
  const rpcCall = {
    id: requestId,
    method: 'connect',
    params: [localUser.pubkey, secret],
  };

  console.log("\nConstructing 'connect' RPC:", rpcCall);

  try {
    // Manually encrypt with NIP-04
    const encryptedContent = await nip04.encrypt(
      localSigner.privateKey!,
      hexTarget,
      JSON.stringify(rpcCall)
    );

    const event = new NDKEvent(ndk);
    event.kind = 24133;
    event.pubkey = localUser.pubkey;
    event.content = encryptedContent;
    event.tags = [['p', hexTarget]];
    event.created_at = Math.floor(Date.now() / 1000);

    await event.sign(localSigner);

    console.log('Publishing manual connect event (ID:', event.id, ')...');
    const publishedTo = await event.publish();

    console.log('Published to:');
    publishedTo.forEach((r) => console.log(` - ${r.url}`));

    console.log("\nWaiting 30s for response. Watch for 'INCOMING EVENT' above...");
    await new Promise((r) => setTimeout(r, 30000));
  } catch (e) {
    console.error('Critical failure in manual handshake:', e);
  } finally {
    sub.stop();
    console.log('\nDiagnostic finished.');
    process.exit();
  }
}

const uri = process.argv[2];
if (!uri) {
  console.error('Usage: npx ts-node scripts/raw_handshake.ts <bunker-uri>');
  process.exit(1);
}

rawHandshake(uri);

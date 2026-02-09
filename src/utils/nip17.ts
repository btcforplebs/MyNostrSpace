/**
 * NIP-17 Private Direct Messages
 * Gift wrap and seal utilities for encrypted 1:1 messaging with metadata protection
 *
 * ⚠️  DEPRECATED: NIP-17 support temporarily disabled (Feb 2026)
 * Reason: NIP-17 requires NIP-44 encryption, which most signers don't support yet
 * Using NIP-04 (legacy DM with kind 4) as primary messaging standard instead
 * Full implementation preserved here for when ecosystem support improves
 */

import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { encryptNip44, decryptNip44, fromHex } from './nip44';
import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import type { NostrEvent } from '@nostr-dev-kit/ndk';

export interface RumorEvent {
  kind: 14;
  content: string;
  created_at: number;
  tags: string[][];
  pubkey?: string;
}

/**
 * Randomize timestamp to prevent metadata leakage
 * Returns timestamp between now and 2 days ago
 */
export function randomizeTimestamp(): number {
  const now = Math.floor(Date.now() / 1000);
  const twoDaysAgo = now - 2 * 24 * 60 * 60;
  return twoDaysAgo + Math.floor(Math.random() * (now - twoDaysAgo));
}

/**
 * Create a kind 14 rumor (unsigned chat message)
 */
export function createRumor(
  content: string,
  senderPubkey: string,
  recipients: string[]
): RumorEvent {
  const tags: string[][] = [];

  // Add p-tags for each recipient
  recipients.forEach((recipient) => {
    tags.push(['p', recipient]);
  });

  return {
    kind: 14,
    content,
    created_at: randomizeTimestamp(),
    tags,
    pubkey: senderPubkey,
  };
}

/**
 * Create a kind 13 seal (encrypted rumor)
 * The seal is an unsigned event containing an encrypted rumor
 */
export function createSeal(
  rumor: RumorEvent,
  senderPrivKey: Uint8Array | string,
  recipientPubKey: string
): {
  kind: 13;
  content: string;
  created_at: number;
  tags: string[][];
} {
  const ruminorJson = JSON.stringify([
    'EVENT',
    {
      kind: rumor.kind,
      content: rumor.content,
      created_at: rumor.created_at,
      tags: rumor.tags,
      pubkey: rumor.pubkey,
    },
  ]);

  const encrypted = encryptNip44(ruminorJson, senderPrivKey, recipientPubKey);

  return {
    kind: 13,
    content: encrypted,
    created_at: randomizeTimestamp(),
    tags: [],
  };
}

/**
 * Create a kind 1059 gift wrap (signed seal with randomized pubkey)
 * Each gift wrap is specific to a recipient
 */
export function createGiftWrap(
  seal: {
    kind: 13;
    content: string;
    created_at: number;
    tags: string[][];
  },
  recipientPubKey: string,
  wrapperPrivKey: Uint8Array
): NDKEvent | null {
  const sealJson = JSON.stringify([
    'EVENT',
    {
      kind: seal.kind,
      content: seal.content,
      created_at: seal.created_at,
      tags: seal.tags,
    },
  ]);

  try {
    // Encrypt the seal with recipient's pubkey
    const encrypted = encryptNip44(sealJson, wrapperPrivKey, recipientPubKey);

    // Create and sign the gift wrap event
    const unsignedEvent = {
      kind: 1059,
      content: encrypted,
      created_at: randomizeTimestamp(),
      tags: [['p', recipientPubKey]],
      pubkey: getPublicKey(wrapperPrivKey),
    };

    const signedEvent = finalizeEvent(unsignedEvent, wrapperPrivKey);
    return new NDKEvent(undefined, signedEvent);
  } catch (err) {
    console.error('Error creating gift wrap:', err);
    return null;
  }
}

/**
 * Create gift-wrapped DMs for a recipient
 * Returns an array with:
 * - Gift wrap for recipient (to send to them)
 * - Gift wrap for sender (for own records/outbox)
 */
export async function createGiftWrappedDM(
  content: string,
  recipientPubKey: string,
  senderPrivKey: Uint8Array | string,
  ndk: NDK
): Promise<NDKEvent[]> {
  const senderPrivKeyBytes = typeof senderPrivKey === 'string' ? fromHex(senderPrivKey) : senderPrivKey;
  const senderPubKey = getPublicKey(senderPrivKeyBytes);

  // 1. Create the rumor (kind 14)
  const rumor = createRumor(content, senderPubKey, [recipientPubKey]);

  // 2. Create the seal (kind 13) - encrypted for recipient
  const seal = createSeal(rumor, senderPrivKeyBytes, recipientPubKey);

  // 3. Generate wrapper keys (randomized for each gift wrap)
  const wrapperPrivKey1 = generateSecretKey();

  // 4. Create gift wrap for recipient
  const giftWrapForRecipient = createGiftWrap(seal, recipientPubKey, wrapperPrivKey1);

  if (!giftWrapForRecipient) {
    throw new Error('Failed to create gift wrap for recipient');
  }

  // 5. Create another wrapper key and gift wrap for sender (outbox)
  const wrapperPrivKey2 = generateSecretKey();
  const giftWrapForSender = createGiftWrap(seal, senderPubKey, wrapperPrivKey2);

  if (!giftWrapForSender) {
    throw new Error('Failed to create gift wrap for sender');
  }

  // Attach NDK instance for publishing
  giftWrapForRecipient.ndk = ndk;
  giftWrapForSender.ndk = ndk;

  return [giftWrapForRecipient, giftWrapForSender];
}

/**
 * Unwrap and decrypt a gift wrap event
 * Returns the decrypted message content and sender pubkey
 */
export function unwrapGiftWrap(
  giftWrapEvent: NostrEvent | NDKEvent,
  receiverPrivKey: Uint8Array | string
): {
  content: string;
  senderPubkey: string;
  timestamp: number;
  kind: number;
} | null {
  try {
    const event = giftWrapEvent instanceof NDKEvent ? giftWrapEvent.rawEvent() : giftWrapEvent;

    // Gift wrap must be kind 1059
    if (event.kind !== 1059) {
      console.warn('Invalid gift wrap kind:', event.kind);
      return null;
    }

    const receiverPrivKeyBytes =
      typeof receiverPrivKey === 'string' ? fromHex(receiverPrivKey) : receiverPrivKey;

    // 1. Decrypt the gift wrap content (which contains the seal)
    const sealJson = decryptNip44(event.content, receiverPrivKeyBytes, event.pubkey);
    const [, sealEvent] = JSON.parse(sealJson);

    if (sealEvent.kind !== 13) {
      console.warn('Invalid seal kind:', sealEvent.kind);
      return null;
    }

    // 2. Decrypt the seal content (which contains the rumor)
    // The seal was encrypted with our pubkey, so we can decrypt it
    const ruminorJson = decryptNip44(sealEvent.content, receiverPrivKeyBytes, sealEvent.pubkey || event.pubkey);
    const [, ruminorEvent] = JSON.parse(ruminorJson);

    if (ruminorEvent.kind !== 14) {
      console.warn('Invalid rumor kind:', ruminorEvent.kind);
      return null;
    }

    return {
      content: ruminorEvent.content,
      senderPubkey: ruminorEvent.pubkey,
      timestamp: ruminorEvent.created_at,
      kind: ruminorEvent.kind,
    };
  } catch (err) {
    console.error('Error unwrapping gift wrap:', err);
    return null;
  }
}

/**
 * Extract p-tags from a kind 14 message to find recipients
 */
export function extractRecipients(tags: string[][]): string[] {
  return tags.filter((tag) => tag[0] === 'p').map((tag) => tag[1]);
}

/**
 * Extract e-tags from a kind 14 message for threading
 */
export function extractThreadTags(tags: string[][]): string[] {
  return tags.filter((tag) => tag[0] === 'e').map((tag) => tag[1]);
}

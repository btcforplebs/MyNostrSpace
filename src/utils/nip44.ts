/**
 * NIP-44 Encryption Utilities
 * Convenience wrappers around nostr-tools/nip44 for consistent encryption/decryption
 *
 * ⚠️  DEPRECATED: NIP-44 support temporarily disabled (Feb 2026)
 * Reason: Most Nostr extensions/signers don't yet support NIP-44 encryption
 * Using NIP-04 (legacy DM) as primary messaging standard instead
 * This code will be re-enabled when ecosystem support improves
 */

import {
  encrypt as nip44Encrypt,
  decrypt as nip44Decrypt,
  getConversationKey,
} from 'nostr-tools/nip44';

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Encrypt plaintext using NIP-44
 * @param plaintext The message content to encrypt
 * @param senderPrivKey Sender's private key (Uint8Array or hex string)
 * @param recipientPubKey Recipient's public key (hex string)
 * @returns Encrypted ciphertext (hex string)
 */
export function encryptNip44(
  plaintext: string,
  senderPrivKey: Uint8Array | string,
  recipientPubKey: string
): string {
  const privKeyBytes =
    typeof senderPrivKey === 'string' ? hexToBytes(senderPrivKey) : senderPrivKey;
  const conversationKey = getConversationKey(privKeyBytes, recipientPubKey);
  return nip44Encrypt(plaintext, conversationKey);
}

/**
 * Decrypt ciphertext using NIP-44
 * @param ciphertext The encrypted message (hex string)
 * @param receiverPrivKey Receiver's private key (Uint8Array or hex string)
 * @param senderPubKey Sender's public key (hex string)
 * @returns Decrypted plaintext
 */
export function decryptNip44(
  ciphertext: string,
  receiverPrivKey: Uint8Array | string,
  senderPubKey: string
): string {
  const privKeyBytes =
    typeof receiverPrivKey === 'string' ? hexToBytes(receiverPrivKey) : receiverPrivKey;
  const conversationKey = getConversationKey(privKeyBytes, senderPubKey);
  return nip44Decrypt(ciphertext, conversationKey);
}

/**
 * Get a conversation key for encryption/decryption
 * @param privKey Private key (Uint8Array or hex string)
 * @param pubKey Public key (hex string)
 * @returns Conversation key for use with NIP-44 encrypt/decrypt
 */
export function getConversationKeyNip44(privKey: Uint8Array | string, pubKey: string): Uint8Array {
  const privKeyBytes = typeof privKey === 'string' ? hexToBytes(privKey) : privKey;
  return getConversationKey(privKeyBytes, pubKey);
}

/**
 * Convert Uint8Array bytes to hex string
 */
export function toHex(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

/**
 * Convert hex string to Uint8Array
 */
export function fromHex(hex: string): Uint8Array {
  return hexToBytes(hex);
}

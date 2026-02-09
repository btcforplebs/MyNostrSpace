/**
 * Signer Encryption Utility
 * Handles encryption with different signer types (NIP-07, NIP-46)
 */

import type NDK from '@nostr-dev-kit/ndk';

export interface SignerEncryptionMethods {
  encrypt: (recipientPubKey: string, plaintext: string) => Promise<string>;
  decrypt: (senderPubKey: string, ciphertext: string) => Promise<string>;
  isNip46: boolean;
}

/**
 * Get encryption methods from the current signer
 * Supports both NIP-07 (extension) and NIP-46 (remote signer)
 */
export async function getSignerEncryption(ndk: NDK | null): Promise<SignerEncryptionMethods | null> {
  if (!ndk || !ndk.signer) {
    return null;
  }

  const signer = ndk.signer;

  // Check if it's a NIP-46 client (has our custom encrypt/decrypt methods)
  if ('encrypt' in signer && 'decrypt' in signer && typeof signer.encrypt === 'function') {
    return {
      encrypt: async (recipientPubKey: string, plaintext: string) => {
        try {
          return await (signer as any).encrypt(
            { pubkey: recipientPubKey } as any,
            plaintext
          );
        } catch (err) {
          throw new Error(`NIP-46 encryption failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
      decrypt: async (senderPubKey: string, ciphertext: string) => {
        try {
          return await (signer as any).decrypt(
            { pubkey: senderPubKey } as any,
            ciphertext
          );
        } catch (err) {
          throw new Error(`NIP-46 decryption failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
      isNip46: true,
    };
  }

  // Try NIP-07 extension
  if (typeof window !== 'undefined' && window.nostr) {
    // Try nip04_encrypt via extension
    if (window.nostr.nip04?.encrypt) {
      return {
        encrypt: async (recipientPubKey: string, plaintext: string) => {
          try {
            const encrypted = await (window.nostr as any).nip04.encrypt(
              recipientPubKey,
              plaintext
            );
            return encrypted;
          } catch (err) {
            throw new Error(
              `NIP-07 encryption failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        },
        decrypt: async (senderPubKey: string, ciphertext: string) => {
          try {
            const decrypted = await (window.nostr as any).nip04.decrypt(
              senderPubKey,
              ciphertext
            );
            return decrypted;
          } catch (err) {
            throw new Error(
              `NIP-07 decryption failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        },
        isNip46: false,
      };
    }

    // Fallback: try generic encrypt method
    if ('encrypt' in window.nostr && typeof (window.nostr as any).encrypt === 'function') {
      return {
        encrypt: async (recipientPubKey: string, plaintext: string) => {
          try {
            return await (window.nostr as any).encrypt(recipientPubKey, plaintext);
          } catch (err) {
            throw new Error(
              `NIP-07 encryption failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        },
        decrypt: async (senderPubKey: string, ciphertext: string) => {
          try {
            return await (window.nostr as any).decrypt(senderPubKey, ciphertext);
          } catch (err) {
            throw new Error(
              `NIP-07 decryption failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        },
        isNip46: false,
      };
    }
  }

  return null;
}

/**
 * Check if the signer supports NIP-44 encryption (required for NIP-17)
 * NIP-44 is different from NIP-04 and not all extensions support it yet
 */
export async function isNip44Supported(ndk: NDK | null): Promise<boolean> {
  if (!ndk || !ndk.signer) {
    return false;
  }

  const signer = ndk.signer;

  // Check if it's a NIP-46 client with our custom encrypt/decrypt methods
  if ('encrypt' in signer && 'decrypt' in signer && typeof signer.encrypt === 'function') {
    return true;
  }

  // Check if it's NIP-07 with nip44 support (newer extensions)
  if (typeof window !== 'undefined' && window.nostr) {
    if (window.nostr.nip44?.encrypt) {
      return true;
    }
  }

  return false;
}

/**
 * Check if the signer supports NIP-17 messaging
 */
export async function isNip17Supported(ndk: NDK | null): Promise<boolean> {
  return isNip44Supported(ndk);
}

/**
 * Get a user-friendly error message for encryption failures
 */
export function getEncryptionErrorMessage(error: Error): string {
  const msg = error.message.toLowerCase();

  if (msg.includes('nip44')) {
    return 'Your signer does not support NIP-44 encryption (required for NIP-17 messaging). Try using Alby, a compatible bunker, or update your extension.';
  }

  if (msg.includes('nip-46') || msg.includes('nip46')) {
    return 'Remote signer error. Please check your bunker connection and ensure it supports NIP-44.';
  }

  if (msg.includes('nip-07') || msg.includes('nip04')) {
    return 'Your extension only supports NIP-04 encryption, but NIP-17 requires NIP-44. Please use Alby or a compatible extension, or try a remote signer (bunker).';
  }

  if (msg.includes('extension')) {
    return 'Extension error. Try refreshing the page or using a different signer.';
  }

  if (msg.includes('not available') || msg.includes('no signer')) {
    return 'No signer available. Please log in first.';
  }

  return `Encryption failed: ${error.message}`;
}

/**
 * Get a user-friendly message explaining NIP-17 compatibility
 */
export function getNip44SupportMessage(): string {
  return 'NIP-17 messaging requires NIP-44 encryption. Most older extensions only support NIP-04. We recommend: 1) Updating Alby, 2) Using Nostr Bunker for remote signing, or 3) Using nos2x if it supports NIP-44.';
}

import NDK from '@nostr-dev-kit/ndk';
import { NDKEvent, NDKUser, type NDKSigner, type NostrEvent } from '@nostr-dev-kit/ndk';
import { getPublicKey, generateSecretKey, finalizeEvent } from 'nostr-tools/pure';
import {
  encrypt as nip44Encrypt,
  decrypt as nip44Decrypt,
  getConversationKey,
} from 'nostr-tools/nip44';

interface RpcRequest {
  id: string;
  method: string;
  params: string[];
}

interface RpcResponse {
  id: string;
  result?: string;
  error?: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Manual NIP-46 client implementation.
 * Bypasses NDK's broken NDKNip46Signer by implementing the protocol directly.
 */
export class NIP46Client {
  private ndk: NDK;
  private clientSecretKey: Uint8Array;
  private clientPubkey: string;
  private bunkerPubkey: string = '';
  private bunkerRelays: string[] = [];
  private secret: string = '';
  private userPubkey: string = '';

  private pendingRequests: Map<
    string,
    {
      resolve: (result: string) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  public onAuthUrl?: (url: string) => void;
  private unsubscribe?: () => void;

  constructor(ndk: NDK) {
    this.ndk = ndk;

    // Load existing key or generate new one
    const savedKey = localStorage.getItem('mynostrspace_nip46_client_key');
    if (savedKey) {
      this.clientSecretKey = hexToBytes(savedKey);
      this.clientPubkey = getPublicKey(this.clientSecretKey);
      console.log('🔑 NIP46Client loaded persisted key:', this.clientPubkey);
    } else {
      this.clientSecretKey = generateSecretKey();
      this.clientPubkey = getPublicKey(this.clientSecretKey);
      localStorage.setItem('mynostrspace_nip46_client_key', bytesToHex(this.clientSecretKey));
      console.log('🔑 NIP46Client generated NEW key (saved to storage):', this.clientPubkey);
    }
  }

  /**
   * Connect to a remote signer using a bunker:// URI
   */
  async connect(bunkerUri: string): Promise<void> {
    console.log('🔗 Connecting to bunker:', bunkerUri);

    // Parse bunker URI
    const url = new URL(bunkerUri);
    this.bunkerPubkey = url.hostname || url.pathname.replace('//', '');
    this.bunkerRelays = url.searchParams.getAll('relay');
    this.secret = url.searchParams.get('secret') || '';

    if (!this.bunkerPubkey) {
      throw new Error('Invalid bunker URI: missing pubkey');
    }

    console.log('📍 Bunker pubkey:', this.bunkerPubkey);
    console.log('📡 Bunker relays:', this.bunkerRelays);
    console.log('🔐 Has secret:', !!this.secret);

    // Add bunker relays to NDK
    this.bunkerRelays.forEach((relay) => this.ndk.addExplicitRelay(relay));

    // Subscribe to responses (kind 24133, p-tag = client pubkey)
    this.subscribeToResponses();

    // Send connect request
    const params = this.secret ? [this.bunkerPubkey, this.secret] : [this.bunkerPubkey];
    const result = await this.rpc('connect', params, 300000); // 5 minutes timeout for connect

    if (result !== 'ack') {
      throw new Error(`Connect failed: expected 'ack', got '${result}'`);
    }

    console.log('✅ Connected to bunker!');

    // Get user pubkey
    this.userPubkey = await this.rpc('get_public_key', []);
    console.log('👤 User pubkey:', this.userPubkey);
  }

  /**
   * Subscribe to response events from the bunker
   */
  private subscribeToResponses(): void {
    console.log('👂 Subscribing to responses...');

    const filter = {
      kinds: [24133],
      '#p': [this.clientPubkey],
    };

    const subscription = this.ndk.subscribe(filter);

    subscription.on('event', (event: NDKEvent) => {
      this.handleResponse(event.rawEvent()).catch((err) => {
        console.error('Error handling response:', err);
      });
    });

    this.unsubscribe = () => subscription.stop();
  }

  /**
   * Handle an incoming response event
   */
  private async handleResponse(event: NostrEvent): Promise<void> {
    try {
      // Decrypt content
      const conversationKey = getConversationKey(this.clientSecretKey, event.pubkey);
      const decrypted = nip44Decrypt(event.content, conversationKey);
      const response: RpcResponse = JSON.parse(decrypted);

      console.log('📨 Received response:', response.id, response.result || response.error);

      // Handle auth_url (NIP-46 special response)
      if (response.result === 'auth_url' && response.error) {
        console.log('🔗 Received auth_url:', response.error);
        if (this.onAuthUrl) {
          this.onAuthUrl(response.error);
        }
        // Do NOT resolve/reject yet, wait for the final response for this ID
        return;
      }

      // Resolve pending request
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);

        if (response.error) {
          pending.reject(new Error(response.error));
        } else if (response.result !== undefined) {
          pending.resolve(response.result);
        } else {
          pending.reject(new Error('Invalid response: no result or error'));
        }
      }
    } catch (err) {
      console.error('Failed to handle response:', err);
    }
  }

  /**
   * Send an RPC request to the bunker
   */
  async rpc(method: string, params: string[], timeoutMs: number = 30000): Promise<string> {
    const id = Math.random().toString(36).substring(2);

    console.log(`📤 Sending RPC: ${method} (id: ${id})`);

    // Create request payload
    const request: RpcRequest = { id, method, params };

    return new Promise((resolve, reject) => {
      // 1. Register pending request FIRST to avoid race condition
      // where response comes back before we register the listener
      this.pendingRequests.set(id, { resolve, reject });

      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`RPC timeout after ${timeoutMs}ms: ${method}`));
        }
      }, timeoutMs);

      (async () => {
        try {
          // 2. Encrypt with NIP-44
          const conversationKey = getConversationKey(this.clientSecretKey, this.bunkerPubkey);
          const encrypted = nip44Encrypt(JSON.stringify(request), conversationKey);

          // 3. Create and sign event
          const unsignedEvent = {
            kind: 24133,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', this.bunkerPubkey]],
            content: encrypted,
          };

          const signedEvent = finalizeEvent(unsignedEvent, this.clientSecretKey);

          // 4. Publish to bunker relays
          const ndkEvent = new NDKEvent(this.ndk, signedEvent);
          await ndkEvent.publish();

          console.log(`✉️  Published request to ${this.bunkerRelays.length} relays`);
        } catch (error) {
          // Cleaning up on publish failure
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(error);
        }
      })();
    });
  }

  /**
   * Get the user's public key
   */
  getUserPubkey(): string {
    if (!this.userPubkey) {
      throw new Error('Not connected - call connect() first');
    }
    return this.userPubkey;
  }

  /**
   * Create an NDKSigner wrapper for this client
   */
  asSigner(): NDKSigner {
    return {
      user: async (): Promise<NDKUser> => {
        const pubkey = this.getUserPubkey();
        const user = new NDKUser({ pubkey });
        user.ndk = this.ndk;
        return user;
      },

      sign: async (event: NostrEvent): Promise<string> => {
        const eventJson = JSON.stringify(event);
        const signedJson = await this.rpc('sign_event', [eventJson]);
        const signed = JSON.parse(signedJson);
        return signed.sig;
      },

      encrypt: async (recipient: NDKUser, plaintext: string): Promise<string> => {
        return this.rpc('nip04_encrypt', [recipient.pubkey, plaintext]);
      },

      decrypt: async (sender: NDKUser, ciphertext: string): Promise<string> => {
        return this.rpc('nip04_decrypt', [sender.pubkey, ciphertext]);
      },
    } as NDKSigner;
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    console.log('👋 Disconnecting NIP46Client...');
    this.unsubscribe?.();
    this.pendingRequests.clear();
  }
}

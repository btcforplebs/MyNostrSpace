import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import NDK, { NDKUser, NDKNip07Signer } from '@nostr-dev-kit/ndk';
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie';
import { NIP46Client } from '../lib/nip46-client';

interface NostrContextType {
  ndk: NDK;
  user: NDKUser | null;
  isLoading: boolean;
  isConnecting: boolean;
  isFirstLoad: boolean;
  login: () => Promise<void>;
  loginWithNip46: (connectionString: string) => Promise<void>;
  logout: () => void;
  relays: string[];
  updateRelays: (relays: string[]) => void;
}

import { filterRelays, ALL_INITIAL_RELAYS } from '../utils/relay';

const NostrContext = createContext<NostrContextType | undefined>(undefined);

export const NostrProvider = ({ children }: { children: ReactNode }) => {
  const [relays, setRelays] = useState<string[]>(() => {
    const saved = localStorage.getItem('mynostrspace_relays');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return filterRelays(parsed);
      } catch (e) {
        console.warn('Failed to parse saved relays', e);
      }
    }
    return ALL_INITIAL_RELAYS;
  });

  // We need to keep the NDK instance construction stable or we loop.
  // So we just use the initial state for the constructor.
  const [ndk] = useState(() => {
    const cacheAdapter = new NDKCacheAdapterDexie({ dbName: 'mynostrspace-ndk-cache' });
    const n = new NDK({
      explicitRelayUrls: relays,
      cacheAdapter: cacheAdapter as import('@nostr-dev-kit/ndk').NDKCacheAdapter,
      outboxRelayUrls: ['wss://purplepag.es'],
    });
    return n;
  });

  const [user, setUser] = useState<NDKUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  const updateRelays = (newRelays: string[]) => {
    const deduplicated = filterRelays(Array.from(new Set(newRelays.map((r) => r.trim()))));
    setRelays(deduplicated);
    localStorage.setItem('mynostrspace_relays', JSON.stringify(deduplicated));

    // Add any new ones immediately
    deduplicated.forEach((url) => {
      try {
        ndk.addExplicitRelay(url);
      } catch (e) {
        console.warn('Error adding relay', e);
      }
    });

    // Note: Removing relays from a live NDK instance is complex.
    // We'll rely on the localStorage update taking full effect on the next reload.
  };

  useEffect(() => {
    const connect = async () => {
      try {
        // Wait for relay connections with a reasonable timeout
        await ndk.connect(5000);

        // Wait a bit for at least one relay to actually connect
        let attempts = 0;
        while (ndk.pool.connectedRelays().length === 0 && attempts < 20) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
        }

        console.log('NDK Connected, relays:', ndk.pool.connectedRelays().length);
      } catch (e) {
        console.warn('NDK connection warning:', e);
      } finally {
        setIsConnecting(false);
        // Only set not loading if we are NOT waiting for auto-login
        // If there's a saved pubkey or bunker config, we let the auth effect handle turning off loading
        if (
          !localStorage.getItem('mynostrspace_pubkey') &&
          !localStorage.getItem('mynostrspace_semiconnected_bunker')
        ) {
          setIsLoading(false);
        }
        setIsFirstLoad(false);
      }
    };

    // Initial connect
    connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ndk is stable from useState

  const login = async () => {
    if (!window.nostr) {
      alert('Nostr extension not found! Please install Alby, nos2x, or similar.');
      return;
    }

    try {
      const signer = new NDKNip07Signer();
      ndk.signer = signer;

      // Fetch User Relays if available
      if (window.nostr.getRelays) {
        try {
          const extRelays = await window.nostr.getRelays();
          // relays is usually { "url": { read: boolean, write: boolean } }
          const relayUrls = filterRelays(Object.keys(extRelays));
          console.log('Found extension relays (filtered):', relayUrls);
          relayUrls.forEach((url) => ndk.addExplicitRelay(url));
        } catch (err) {
          console.warn('Failed to get relays from extension', err);
        }
      }

      const user = await signer.user();
      await user.fetchProfile();
      setUser(user);
      localStorage.setItem('mynostrspace_pubkey', user.pubkey);
      // Clear any previous remote signing sessions
      localStorage.removeItem('mynostrspace_semiconnected_bunker');
      localStorage.removeItem('mynostrspace_local_key');
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const loginWithNip46 = async (connectionString: string) => {
    try {
      console.log('=== Starting NIP-46 login ===');
      console.log('Connection string:', connectionString);

      // Clear previous state
      localStorage.removeItem('mynostrspace_pubkey');
      // Do NOT clear the bunker string yet, in case we fail transiently and want to retry on reload
      // localStorage.removeItem('mynostrspace_semiconnected_bunker');
      localStorage.removeItem('mynostrspace_local_key');
      setUser(null);
      ndk.signer = undefined;

      // Ensure NDK is connected
      console.log('Connecting to NDK relays...');
      await ndk.connect(2000).catch((e) => console.warn('NDK connect:', e));

      // Create NIP46 client and connect
      console.log('Creating NIP46Client...');
      const nip46Client = new NIP46Client(ndk);
      nip46Client.onAuthUrl = (url) => {
        console.log('🔗 NIP-46 Auth URL received:', url);
        window.open(url, 'signet-auth', 'width=450,height=700');
      };
      await nip46Client.connect(connectionString);
      console.log('✅ NIP-46 connection established!');

      // Wrap as NDKSigner and set user
      ndk.signer = nip46Client.asSigner();
      const user = await ndk.signer.user();

      try {
        await user.fetchProfile();
      } catch (err) {
        console.warn('Failed to fetch profile during login, proceeding anyway:', err);
      }

      setUser(user);
      setUser(user);
      localStorage.setItem('mynostrspace_pubkey', user.pubkey);

      // Save bunker URI *without* secret for future auto-logins
      // The secret is likely one-time use; future logins rely on the established Client Key trust
      try {
        const urlObj = new URL(connectionString);
        urlObj.searchParams.delete('secret');
        localStorage.setItem('mynostrspace_semiconnected_bunker', urlObj.toString());
      } catch (e) {
        console.warn('Failed to parse/clean bunker string, saving raw:', e);
        localStorage.setItem('mynostrspace_semiconnected_bunker', connectionString);
      }

      console.log('NIP-46 login complete for:', user.pubkey);
    } catch (error) {
      console.error('NIP-46 Login failed:', error);
      alert(
        'Failed to connect to remote signer: ' +
        (error instanceof Error ? error.message : String(error))
      );
      throw error;
    }
  };

  const logout = () => {
    ndk.signer = undefined;
    setUser(null);
    localStorage.removeItem('mynostrspace_pubkey');
    localStorage.removeItem('mynostrspace_semiconnected_bunker');
    localStorage.removeItem('mynostrspace_local_key');
  };

  // Auto-login if previously logged in
  useEffect(() => {
    const savedPubkey = localStorage.getItem('mynostrspace_pubkey');
    const savedBunker = localStorage.getItem('mynostrspace_semiconnected_bunker');

    if (savedBunker) {
      // Handle NIP-46 Reconnection
      const reconnectNip46 = async () => {
        try {
          await loginWithNip46(savedBunker);
        } catch (err) {
          console.error('Auto-login w/ NIP-46 failed:', err);
        } finally {
          setIsLoading(false);
        }
      };
      reconnectNip46();
    } else if (savedPubkey) {
      let attempts = 0;
      const maxAttempts = 20;

      const checkAndLogin = async () => {
        if (window.nostr) {
          try {
            await login();
          } catch (err) {
            console.error('Auto-login failed:', err);
          } finally {
            setIsLoading(false);
          }
        } else {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkAndLogin, 250);
          } else {
            console.warn('Nostr extension not found after polling.');
            setIsLoading(false);
          }
        }
      };

      checkAndLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <NostrContext.Provider
      value={{ ndk, user, isLoading, isConnecting, isFirstLoad, login, loginWithNip46, logout, relays, updateRelays }}
    >
      {children}
    </NostrContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useNostr = () => {
  const context = useContext(NostrContext);
  if (!context) {
    throw new Error('useNostr must be used within a NostrProvider');
  }
  return context;
};

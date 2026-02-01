import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import NDK, { NDKUser, NDKNip07Signer } from '@nostr-dev-kit/ndk';

interface NostrContextType {
    ndk: NDK;
    user: NDKUser | null;
    isLoading: boolean;
    login: () => Promise<void>;
    logout: () => void;
    relays: string[];
    updateRelays: (relays: string[]) => void;
}

const NostrContext = createContext<NostrContextType | undefined>(undefined);

const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.nostr.band',
    'wss://nos.lol',
];

export const NostrProvider = ({ children }: { children: ReactNode }) => {

    const [relays, setRelays] = useState<string[]>(() => {
        const saved = localStorage.getItem('mynostrspace_relays');
        return saved ? JSON.parse(saved) : DEFAULT_RELAYS;
    });

    // Re-initialize NDK if we wanted to support hot-swapping fully, 
    // but for now we just initialize once with the current storage state.
    // However, to support adding relays dynamically, we'll keep the single instance 
    // and just use addExplicitRelay via updateRelays.

    // We need to keep the NDK instance construction stable or we loop. 
    // So we just use the initial state for the constructor.
    const [ndk] = useState<NDK>(() => new NDK({ explicitRelayUrls: relays }));

    const [user, setUser] = useState<NDKUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const updateRelays = (newRelays: string[]) => {
        setRelays(newRelays);
        localStorage.setItem('mynostrspace_relays', JSON.stringify(newRelays));

        // Add any new ones immediately
        newRelays.forEach(url => {
            try {
                ndk.addExplicitRelay(url);
            } catch (e) { console.warn("Error adding relay", e); }
        });

        // Note: Removing relays from a live NDK instance is complex. 
        // We'll rely on the localStorage update taking full effect on the next reload.
    };

    useEffect(() => {
        const connect = async () => {
            try {
                // Wait for connection OR timeout after 2 seconds
                await Promise.race([
                    ndk.connect(2000),
                    new Promise(resolve => setTimeout(resolve, 2000))
                ]);
            } catch (e) {
                console.warn('NDK connection warning:', e);
            } finally {
                console.log('NDK Initialized (Connected or Timeout)');

                // Only set not loading if we are NOT waiting for auto-login
                // If there's a saved pubkey, we let the auth effect handle turning off loading
                if (!localStorage.getItem('mynostrspace_pubkey')) {
                    setIsLoading(false);
                }
            }
        };

        connect();
    }, [ndk]);

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
                    const relayUrls = Object.keys(extRelays);
                    console.log("Found extension relays:", relayUrls);
                    relayUrls.forEach(url => ndk.addExplicitRelay(url));

                    // Optional: Should we auto-add these to our custom list? 
                    // Maybe better to ask the user or keeping them separate for now.
                } catch (err) {
                    console.warn("Failed to get relays from extension", err);
                }
            }

            const user = await signer.user();
            await user.fetchProfile();
            setUser(user);
            localStorage.setItem('mynostrspace_pubkey', user.pubkey);
        } catch (error) {
            console.error('Login failed:', error);
        }
    };

    const logout = () => {
        ndk.signer = undefined;
        setUser(null);
        localStorage.removeItem('mynostrspace_pubkey');
    };

    // Auto-login if previously logged in
    useEffect(() => {
        const savedPubkey = localStorage.getItem('mynostrspace_pubkey');

        if (savedPubkey) {
            // We expect to login, so keep loading true

            let attempts = 0;
            const maxAttempts = 20; // 5 seconds total (250ms * 20)

            const checkAndLogin = async () => {
                if (window.nostr) {
                    try {
                        await login();
                    } catch (err) {
                        console.error("Auto-login failed:", err);
                        // If auto-login fails (e.g. user rejected), we might want to plain logout?
                        // For now, we'll just stop loading so they see the landing page.
                    } finally {
                        setIsLoading(false);
                    }
                } else {
                    attempts++;
                    if (attempts < maxAttempts) {
                        setTimeout(checkAndLogin, 250);
                    } else {
                        // Extension didn't load in time
                        console.warn("Nostr extension not found after polling.");
                        setIsLoading(false);
                    }
                }
            };

            // Start polling
            checkAndLogin();
        }
    }, []);

    return (
        <NostrContext.Provider value={{ ndk, user, isLoading, login, logout, relays, updateRelays }}>
            {children}
        </NostrContext.Provider>
    );
};

export const useNostr = () => {
    const context = useContext(NostrContext);
    if (!context) {
        throw new Error('useNostr must be used within a NostrProvider');
    }
    return context;
};

import { useEffect, useState, useCallback } from 'react';
import { NDKUser, NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import { useNostr } from '../context/NostrContext';
import { getCachedData, setCachedData } from '../utils/cache';

export const useTop8 = (pubkey?: string) => {
  const { ndk } = useNostr();
  const [top8, setTop8] = useState<NDKUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTop8 = useCallback(async () => {
    if (!pubkey || !ndk) return;

    // Check cache
    const cachedPubkeys = getCachedData<string[]>(`top8_${pubkey}`);
    if (cachedPubkeys) {
      const users = cachedPubkeys.map((pk) => ndk.getUser({ pubkey: pk }));
      setTop8(users);
      setLoading(false);
      // Trigger background fetches for profiles
      users.forEach((u) => {
        u.fetchProfile()
          .then(() => setTop8((prev) => [...prev]))
          .catch(() => {});
      });
    }

    setLoading(!cachedPubkeys);
    try {
      let hexPubkey = pubkey;
      if (pubkey.startsWith('npub') || pubkey.startsWith('nprofile')) {
        const tempUser = ndk.getUser({
          [pubkey.startsWith('npub') ? 'npub' : 'nprofile']: pubkey,
        });
        hexPubkey = tempUser.pubkey;
      }

      console.log(`Fetching Top 8 for ${hexPubkey}...`);
      // Fetch Kind 30000 with d="top8" - add timeout
      const event = await Promise.race([
        ndk.fetchEvent({
          kinds: [30000 as NDKKind],
          authors: [hexPubkey],
          '#d': ['top8'],
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);

      if (event) {
        console.log(`Top 8 event found for ${hexPubkey}`);
        // Get all pubkeys from 'p' tags
        const pPubkeys = event.tags.filter((t) => t[0] === 'p').map((t) => t[1]);

        // Set initial list immediately with empty profiles
        const users = pPubkeys.map((pk) => ndk.getUser({ pubkey: pk }));
        setTop8(users);
        setCachedData(`top8_${pubkey}`, pPubkeys);
        setLoading(false);

        // Background: Resolve each profile individually with its own timeout
        // Update state as each one resolves so they "pop in"
        users.forEach((u) => {
          Promise.race([
            u.fetchProfile(),
            new Promise((_, reject) => setTimeout(() => reject('timeout'), 3000)),
          ])
            .then(() => {
              setTop8((prev) => [...prev]); // Trigger re-render with the newly fetched profile
            })
            .catch(() => {
              // Profile fetch failed or timed out, that's okay, we already have the pubkey
            });
        });
      } else {
        console.log(`No Top 8 event found for ${hexPubkey}`);
        setTop8([]);
        setLoading(false);
      }
    } catch (e) {
      console.error('Error fetching Top 8', e);
      setLoading(false);
    }
  }, [ndk, pubkey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTop8();
  }, [fetchTop8]);

  const saveTop8 = async (newTop8: NDKUser[]) => {
    if (!ndk) return;

    try {
      const event = new NDKEvent(ndk);
      event.kind = 30000 as NDKKind;
      event.tags = [
        ['d', 'top8'],
        ['client', 'MyNostrSpace'],
        ...newTop8.map((u) => ['p', u.pubkey]),
      ];
      await event.publish();
      setTop8(newTop8);
      alert('Top 8 updated!');
    } catch (e) {
      console.error('Error saving Top 8', e);
      alert('Failed to save Top 8');
    }
  };

  return { top8, loading, saveTop8 };
};

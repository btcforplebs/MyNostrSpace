import { useEffect, useState } from 'react';
import { useNostr } from '../context/NostrContext';

export const useResolvedPubkey = (identifier?: string) => {
  const { ndk } = useNostr();
  const [hexPubkey, setHexPubkey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!identifier || !ndk) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const resolve = async () => {
      setLoading(true);
      try {
        if (identifier.includes('@')) {
          // NIP-05: must use the async resolver. ndk.getUser({ nip05 }) does not
          // set a pubkey (and the getter throws), so it can never resolve.
          const resolvedUser = await ndk.getUserFromNip05(identifier);
          if (!cancelled && resolvedUser?.pubkey) setHexPubkey(resolvedUser.pubkey);
        } else if (identifier.startsWith('npub') || identifier.startsWith('nprofile')) {
          const user = ndk.getUser({
            [identifier.startsWith('npub') ? 'npub' : 'nprofile']: identifier,
          });
          if (!cancelled) setHexPubkey(user.pubkey);
        } else if (/^[0-9a-fA-F]{64}$/.test(identifier)) {
          // It's a hex pubkey
          if (!cancelled) setHexPubkey(identifier);
        } else {
          // Try to search for it as a name (Search fallback)
          // This allows /p/Tom to work by finding a user named Tom
          const users = await ndk.fetchEvents({
            kinds: [0],
            search: identifier,
            limit: 10,
          });

          if (users.size > 0) {
            // Find the one that matches best (e.g. name or displayName equals identifier)
            const match = Array.from(users).find((e) => {
              try {
                const p = JSON.parse(e.content);
                return (
                  p.name?.toLowerCase() === identifier.toLowerCase() ||
                  p.display_name?.toLowerCase() === identifier.toLowerCase()
                );
              } catch {
                return false;
              }
            });

            if (cancelled) return;
            if (match) {
              setHexPubkey(match.pubkey);
            } else {
              // Just take the first one as a last resort
              setHexPubkey(Array.from(users)[0].pubkey);
            }
          }
        }
      } catch (e) {
        console.error('Failed to resolve pubkey', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [ndk, identifier]);

  return { hexPubkey, loading };
};

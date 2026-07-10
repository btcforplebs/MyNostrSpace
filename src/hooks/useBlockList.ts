import { useEffect, useMemo, useState } from 'react';
import { NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { useNostr } from '../context/NostrContext';
import { BLOCKED_PUBKEYS } from '../utils/blockedUsers';

export const useBlockList = () => {
  const { ndk, user } = useNostr();
  const [blockedByNostr, setBlockedByNostr] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ndk || !user?.pubkey) return;

    const fetchMuteList = async () => {
      setLoading(true);
      try {
        // Fetch Kind 10000 (Mute List)
        const muteListEvent = await ndk.fetchEvent(
          {
            kinds: [10000],
            authors: [user.pubkey],
          },
          { cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST }
        );

        if (muteListEvent) {
          const pubkeys = new Set<string>();
          muteListEvent.tags.forEach((tag) => {
            if (tag[0] === 'p' && tag[1]) {
              pubkeys.add(tag[1]);
            }
          });
          setBlockedByNostr(pubkeys);
        }
      } catch (e) {
        console.error('Error fetching mute list:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchMuteList();

    // Subscribe for live updates, close after initial sync
    const sub = ndk.subscribe(
      { kinds: [10000], authors: [user.pubkey] },
      { cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY, closeOnEose: true }
    );

    sub.on('event', (ev: NDKEvent) => {
      const pubkeys = new Set<string>();
      ev.tags.forEach((tag) => {
        if (tag[0] === 'p' && tag[1]) {
          pubkeys.add(tag[1]);
        }
      });
      setBlockedByNostr(pubkeys);
    });

    return () => sub.stop();
  }, [ndk, user?.pubkey]);

  const blockUser = async (pubkeyToBlock: string) => {
    if (!ndk || !user?.pubkey) return;
    try {
      // Re-fetch the latest mute list immediately before writing. Rebuilding from
      // possibly-stale local state (or an empty cold cache) would erase other
      // muted users, and hardcoding content='' destroys NIP-51 private/encrypted
      // mutes and any word/tag mute entries created by other clients.
      const latest = await ndk.fetchEvent({ kinds: [10000], authors: [user.pubkey] });

      // Never overwrite an established mute list we failed to load.
      if (!latest && blockedByNostr.size > 0) {
        alert('Could not load your current mute list. Please try again.');
        return;
      }

      // Already muted — reflect locally, nothing to publish.
      if (latest?.tags.some((t) => t[0] === 'p' && t[1] === pubkeyToBlock)) {
        setBlockedByNostr((prev) => new Set(prev).add(pubkeyToBlock));
        return;
      }

      const event = new NDKEvent(ndk);
      event.kind = 10000;
      event.content = latest?.content ?? ''; // preserve encrypted private mutes
      event.tags = latest ? [...latest.tags] : []; // preserve all tags verbatim
      event.tags.push(['p', pubkeyToBlock]);
      await event.publish();

      const pubkeys = new Set<string>();
      event.tags.forEach((t) => {
        if (t[0] === 'p' && t[1]) pubkeys.add(t[1]);
      });
      setBlockedByNostr(pubkeys);
      alert('User blocked successfully!');
    } catch (e) {
      console.error('Error blocking user:', e);
      alert('Failed to block user.');
    }
  };

  const isBlocked = (pubkey: string): boolean => {
    return BLOCKED_PUBKEYS.has(pubkey) || blockedByNostr.has(pubkey);
  };

  // Memoized so its identity is stable across renders — an unstable Set here
  // restarts every downstream subscription/effect that depends on it.
  const allBlockedPubkeys = useMemo(
    () => new Set([...BLOCKED_PUBKEYS, ...blockedByNostr]),
    [blockedByNostr]
  );

  return { isBlocked, allBlockedPubkeys, blockUser, loading };
};

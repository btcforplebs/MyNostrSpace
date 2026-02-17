import { useEffect, useState } from 'react';
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
      const newBlocked = new Set(blockedByNostr);
      newBlocked.add(pubkeyToBlock);

      const event = new NDKEvent(ndk);
      event.kind = 10000;
      event.content = '';
      event.tags = Array.from(newBlocked).map((pk) => ['p', pk]);
      await event.publish();
      setBlockedByNostr(newBlocked);
      alert('User blocked successfully!');
    } catch (e) {
      console.error('Error blocking user:', e);
      alert('Failed to block user.');
    }
  };

  const isBlocked = (pubkey: string): boolean => {
    return BLOCKED_PUBKEYS.has(pubkey) || blockedByNostr.has(pubkey);
  };

  const allBlockedPubkeys = new Set([
    ...Array.from(BLOCKED_PUBKEYS),
    ...Array.from(blockedByNostr),
  ]);

  return { isBlocked, allBlockedPubkeys, blockUser, loading };
};

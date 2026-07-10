import { useEffect, useState, useCallback, useMemo } from 'react';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { useNostr } from '../context/NostrContext';
import { useBlockList } from './useBlockList';

export const useFriends = (pubkey?: string) => {
  const { ndk } = useNostr();
  const { allBlockedPubkeys } = useBlockList();
  const [friends, setFriends] = useState<string[]>([]); // Now returns pubkeys
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pubkey || !ndk) return;

    const fetchFriends = async () => {
      setLoading(true);
      try {
        let hexPubkey = pubkey;
        if (pubkey.startsWith('npub') || pubkey.startsWith('nprofile')) {
          const tempUser = ndk.getUser({
            [pubkey.startsWith('npub') ? 'npub' : 'nprofile']: pubkey,
          });
          hexPubkey = tempUser.pubkey;
        }

        const user = ndk.getUser({ pubkey: hexPubkey });
        // Get the contact list (Kind 3)
        const follows = await user.follows();

        // Just store pubkeys
        const friendPubkeys = Array.from(follows).map((u) => u.pubkey);
        setFriends(friendPubkeys);
      } catch (e) {
        console.error('Error fetching friends', e);
      } finally {
        setLoading(false);
      }
    };

    fetchFriends();
  }, [ndk, pubkey]);

  const fetchProfiles = useCallback(
    async (pubkeys: string[]): Promise<NDKUser[]> => {
      if (!ndk || pubkeys.length === 0) return [];
      try {
        // Create user objects and fetch profiles
        // NDK handles batching if we do it concurrently
        const users = pubkeys.map((pk) => ndk.getUser({ pubkey: pk }));
        await Promise.all(users.map((u) => u.fetchProfile()));
        return users;
      } catch (e) {
        console.error('Error fetching profiles', e);
        return [];
      }
    },
    [ndk]
  );

  const followUser = async (targetPubkey: string) => {
    if (!ndk || !ndk.activeUser) {
      alert('Please login to follow users!');
      return;
    }

    try {
      const user = ndk.activeUser;

      // 1. Fetch the latest contact list (Kind 3) event directly. Building the
      //    new event from this preserves relay hints (content) and petname/other
      //    tags, and lets us tell "follows nobody" apart from "fetch failed".
      const contactEvent = await ndk.fetchEvent({
        kinds: [3],
        authors: [user.pubkey],
      });

      // 2. Check if already following
      const alreadyFollowing = contactEvent?.tags.some(
        (tag) => tag[0] === 'p' && tag[1] === targetPubkey
      );
      if (alreadyFollowing) {
        alert('You are already following this user!');
        return;
      }

      // 3. Safety guard: never overwrite an existing follow list we failed to
      //    load. If we know locally that this user follows people (their own
      //    profile is loaded) but the fetch returned nothing, the fetch failed —
      //    abort rather than replace the list with a single entry.
      const hasEstablishedList = pubkey === user.pubkey && friends.length > 0;
      if (!contactEvent && hasEstablishedList) {
        alert('Could not load your current follow list. Please try again.');
        return;
      }

      // 4. Rebuild from the existing event verbatim, then append the new follow.
      const newEvent = new NDKEvent(ndk);
      newEvent.kind = 3;
      newEvent.tags = contactEvent ? [...contactEvent.tags] : [];
      newEvent.content = contactEvent?.content ?? '';
      newEvent.tags.push(['p', targetPubkey]);
      await newEvent.publish();

      alert('Followed successfully!');
      // The hook fetches based on `pubkey` prop. If that's us, reflect the add.
      if (pubkey === user.pubkey) {
        setFriends((prev) => [...prev, targetPubkey]);
      }
    } catch (e) {
      console.error('Failed to follow:', e);
      alert('Failed to follow user.');
    }
  };

  const filteredFriends = useMemo(() => {
    return friends.filter((pk) => !allBlockedPubkeys.has(pk));
  }, [friends, allBlockedPubkeys]);

  return { friends: filteredFriends, loading, followUser, fetchProfiles };
};

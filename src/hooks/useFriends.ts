import { useEffect, useState, useCallback, useMemo } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
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
      // 1. Fetch latest contact list to ensure we don't overwrite
      const user = ndk.activeUser;
      await user.fetchProfile();
      const follows = await user.follows();

      // 2. Check if already following
      const isFollowing = Array.from(follows).some((u) => u.pubkey === targetPubkey);
      if (isFollowing) {
        alert('You are already following this user!');
        return;
      }

      // 3. Add new user
      const targetUser = ndk.getUser({ pubkey: targetPubkey });
      follows.add(targetUser);

      // 4. Publish updated list
      await user.follow(targetUser);

      alert('Followed successfully!');
      // Update local state if we are viewing our own profile?
      // The hook fetches based on `pubkey` prop. If that's us, we should reload.
      if (pubkey === user.pubkey) {
        setFriends((prev) => [...prev, targetUser.pubkey]);
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

import { useEffect, useState } from 'react';
import { type NDKUserProfile, NDKSubscriptionCacheUsage, NDKEvent } from '@nostr-dev-kit/ndk';
import { useNostr } from '../context/NostrContext';

export interface ExtendedProfile extends NDKUserProfile {
  website?: string;
  lud16?: string;
  banner?: string;
}

export const useProfile = (pubkey?: string) => {
  const { ndk } = useNostr();
  const [profile, setProfile] = useState<ExtendedProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pubkey || !ndk) return;

    const fetchProfile = async () => {
      try {
        let user;
        if (pubkey.startsWith('npub') || pubkey.startsWith('nprofile')) {
          user = ndk.getUser({
            [pubkey.startsWith('npub') ? 'npub' : 'nprofile']: pubkey,
          });
        } else {
          user = ndk.getUser({ pubkey });
        }

        // 1. Try to get from NDK object if already there
        if (user.profile) {
          setProfile(user.profile as ExtendedProfile);
          // Don't stop loading yet if we want a fresh fetch
        }

        // 2. Fetch from relays/cache
        await Promise.race([
          user.fetchProfile({ cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
        ]).catch((err) => {
          console.warn(`Profile fetch for ${pubkey} timed out or failed:`, err);
        });

        if (user.profile) {
          setProfile(user.profile as ExtendedProfile);
        }
      } catch (e) {
        console.error('Error in useProfile hook:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [ndk, pubkey]);

  const publishProfile = async (newProfile: ExtendedProfile) => {
    if (!ndk || !pubkey) return;

    try {
      const event = new NDKEvent(ndk);
      event.kind = 0;
      event.content = JSON.stringify(newProfile);
      event.tags = [['client', 'MyNostrSpace']];
      await event.publish();
      setProfile(newProfile);
      alert('Profile metadata updated!');
    } catch (error) {
      console.error('Error publishing profile:', error);
      alert('Failed to update profile metadata.');
    }
  };

  return { profile, loading, publishProfile };
};

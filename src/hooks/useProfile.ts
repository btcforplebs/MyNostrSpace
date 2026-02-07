import { useEffect, useState, useCallback } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNostr } from '../context/NostrContext';
import {
  subscribeToProfile,
  updateCachedProfile,
  getProfile,
  type ExtendedProfile,
} from './profileCache';

// Re-export for backward compatibility
export type { ExtendedProfile } from './profileCache';

export const useProfile = (pubkey?: string) => {
  const { ndk } = useNostr();
  const [profile, setProfile] = useState<ExtendedProfile | null>(() => {
    // Initialize from cache if available
    if (pubkey && ndk) {
      return getProfile(pubkey);
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pubkey || !ndk) {
      setLoading(false);
      return;
    }

    // Subscribe to profile updates from the shared cache
    const unsubscribe = subscribeToProfile(pubkey, ndk, (updatedProfile) => {
      setProfile(updatedProfile);
      setLoading(false);
    });

    // Set a timeout to stop loading even if no profile found
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5500);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [ndk, pubkey]);

  const publishProfile = useCallback(
    async (newProfile: ExtendedProfile) => {
      if (!ndk || !pubkey) return;

      try {
        const event = new NDKEvent(ndk);
        event.kind = 0;
        event.content = JSON.stringify(newProfile);
        event.tags = [['client', 'MyNostrSpace']];
        await event.publish();

        // Update both local state and cache
        setProfile(newProfile);
        updateCachedProfile(pubkey, newProfile);

        alert('Profile metadata updated!');
      } catch (error) {
        console.error('Error publishing profile:', error);
        alert('Failed to update profile metadata.');
      }
    },
    [ndk, pubkey]
  );

  return { profile, loading, publishProfile };
};

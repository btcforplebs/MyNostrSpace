import { useEffect, useState } from 'react';
import { type NDKUserProfile } from '@nostr-dev-kit/ndk';
import { useNostr } from '../context/NostrContext';
import { getCachedData, setCachedData } from '../utils/cache';

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
            // Check cache first
            const cached = getCachedData<ExtendedProfile>(`profile_${pubkey}`);
            if (cached) {
                setProfile(cached);
                setLoading(false);
                // We still fetch in background to refresh cache (SWR pattern-ish)
            }

            setLoading(!cached);
            try {
                // If it's a nip19 (npub, nprofile), NDK can handle resolving it
                // We'll create a user instance and get the hex pubkey first
                let user;
                if (pubkey.startsWith('npub') || pubkey.startsWith('nprofile')) {
                    user = ndk.getUser({
                        [pubkey.startsWith('npub') ? 'npub' : 'nprofile']: pubkey
                    });
                } else {
                    user = ndk.getUser({ pubkey });
                }

                // Add a timeout to ensure we don't block forever
                await Promise.race([
                    user.fetchProfile(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 4000))
                ]).catch(err => {
                    console.warn(`Profile fetch timed out for ${pubkey}`, err);
                });

                setProfile(user.profile as ExtendedProfile);
                if (user.profile) {
                    setCachedData(`profile_${pubkey}`, user.profile);
                }
            } catch (e) {
                console.error('Error fetching profile', e);
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [ndk, pubkey]);

    const publishProfile = async (newProfile: ExtendedProfile) => {
        if (!ndk || !pubkey) return;

        try {
            const user = ndk.getUser({ pubkey });
            user.profile = newProfile;
            await user.publish();
            setProfile(newProfile);
            alert("Profile metadata updated!");
        } catch (error) {
            console.error("Error publishing profile:", error);
            alert("Failed to update profile metadata.");
        }
    };

    return { profile, loading, publishProfile };
};

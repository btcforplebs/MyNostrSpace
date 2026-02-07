import { useEffect, useState } from 'react';
import { useNostr } from '../context/NostrContext';

export type RelationshipStatus = 'is you!' | 'is in your following list' | 'is blocked' | 'is in your web of trust' | 'is outside your web of trust';

export const useRelationshipStatus = (targetPubkey?: string): { status: RelationshipStatus | null; loading: boolean } => {
  const { ndk, user } = useNostr();
  const [status, setStatus] = useState<RelationshipStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!targetPubkey || !user || !ndk) {
      setStatus(null);
      setLoading(false);
      return;
    }

    const determineStatus = async () => {
      try {
        // Check if it's the user themselves
        if (targetPubkey === user.pubkey) {
          setStatus('is you!');
          setLoading(false);
          return;
        }

        // Check if user has blocked the target (Kind 10008)
        const blockedEvent = await ndk.fetchEvent({
          kinds: [10008 as number],
          authors: [user.pubkey],
        });

        if (blockedEvent) {
          const blockedPubkeys = blockedEvent.tags
            .filter(tag => tag[0] === 'p')
            .map(tag => tag[1]);

          if (blockedPubkeys.includes(targetPubkey)) {
            setStatus('is blocked');
            setLoading(false);
            return;
          }
        }

        // Check if user is following the target
        const currentUser = ndk.getUser({ pubkey: user.pubkey });
        const follows = await currentUser.follows();
        const isFollowing = Array.from(follows).some(u => u.pubkey === targetPubkey);

        if (isFollowing) {
          setStatus('is in your following list');
          setLoading(false);
          return;
        }

        // Check if target is in the web of trust (followed by people you follow)
        const followingPubkeys = Array.from(follows).map(u => u.pubkey);

        // Check if any of the people you follow are following the target
        let isInWebOfTrust = false;
        for (const followerPubkey of followingPubkeys) {
          try {
            const followerUser = ndk.getUser({ pubkey: followerPubkey });
            const followerFollows = await followerUser.follows();
            if (Array.from(followerFollows).some(u => u.pubkey === targetPubkey)) {
              isInWebOfTrust = true;
              break;
            }
          } catch (err) {
            // Continue checking other followers if one fails
            console.warn(`Could not fetch follows for ${followerPubkey}:`, err);
          }
        }

        if (isInWebOfTrust) {
          setStatus('is in your web of trust');
        } else {
          setStatus('is outside your web of trust');
        }
      } catch (error) {
        console.error('Error determining relationship status:', error);
        setStatus('is outside your web of trust'); // Default fallback
      } finally {
        setLoading(false);
      }
    };

    determineStatus();
  }, [targetPubkey, user, ndk]);

  return { status, loading };
};

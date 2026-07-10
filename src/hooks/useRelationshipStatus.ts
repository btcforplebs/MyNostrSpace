import { useEffect, useState } from 'react';
import { useNostr } from '../context/NostrContext';

export type RelationshipStatus =
  | 'is you!'
  | 'is in your following list'
  | 'is blocked'
  | 'is in your web of trust'
  | 'is outside your web of trust';

export const useRelationshipStatus = (
  targetPubkey?: string
): { status: RelationshipStatus | null; followsBack: boolean; loading: boolean } => {
  const { ndk, user } = useNostr();
  const [status, setStatus] = useState<RelationshipStatus | null>(null);
  const [followsBack, setFollowsBack] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!targetPubkey || !user || !ndk) {
      setStatus(null);
      setFollowsBack(false);
      setLoading(false);
      return;
    }

    // Guard against a slow run for a previous target landing after the effect
    // re-ran for a new one (which would show A's relationship on B's profile).
    let cancelled = false;
    setLoading(true);
    setStatus(null);
    setFollowsBack(false);

    const determineStatus = async () => {
      try {
        if (targetPubkey === user.pubkey) {
          if (!cancelled) {
            setStatus('is you!');
            setLoading(false);
          }
          return;
        }

        // Fetch mute list, current user's follows, and target's contact list in parallel
        const [muteEvent, follows, targetContactEvent] = await Promise.all([
          ndk.fetchEvent({ kinds: [10000], authors: [user.pubkey] }),
          ndk.getUser({ pubkey: user.pubkey }).follows(),
          ndk.fetchEvent({ kinds: [3], authors: [targetPubkey] }),
        ]);
        if (cancelled) return;

        // Does the target follow us back? (their Kind 3 contains our pubkey)
        const targetFollowsPubkeys = (targetContactEvent?.tags ?? [])
          .filter((tag) => tag[0] === 'p')
          .map((tag) => tag[1]);
        setFollowsBack(targetFollowsPubkeys.includes(user.pubkey));

        // Have we muted the target? (Kind 10000)
        if (muteEvent) {
          const mutedPubkeys = muteEvent.tags
            .filter((tag) => tag[0] === 'p')
            .map((tag) => tag[1]);
          if (mutedPubkeys.includes(targetPubkey)) {
            setStatus('is blocked');
            setLoading(false);
            return;
          }
        }

        // Are we following the target?
        const isFollowing = Array.from(follows).some((u) => u.pubkey === targetPubkey);
        if (isFollowing) {
          setStatus('is in your following list');
          setLoading(false);
          return;
        }

        // Web of trust: is the target followed by anyone we follow? One filtered
        // query answers this — asking for any Kind-3 among our follows that
        // p-tags the target — instead of fetching every follow's contact list.
        const followingPubkeys = Array.from(follows).map((u) => u.pubkey);
        let isInWebOfTrust = false;
        if (followingPubkeys.length > 0) {
          const wotEvents = await ndk.fetchEvents({
            kinds: [3],
            authors: followingPubkeys,
            '#p': [targetPubkey],
            limit: 1,
          });
          isInWebOfTrust = wotEvents.size > 0;
        }
        if (cancelled) return;

        setStatus(isInWebOfTrust ? 'is in your web of trust' : 'is outside your web of trust');
      } catch (error) {
        console.error('Error determining relationship status:', error);
        if (!cancelled) setStatus('is outside your web of trust');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    determineStatus();

    return () => {
      cancelled = true;
    };
  }, [targetPubkey, user, ndk]);

  return { status, followsBack, loading };
};

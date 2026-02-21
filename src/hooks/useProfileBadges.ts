import { useState, useEffect, useCallback, useRef } from 'react';
import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';

export interface BadgeDisplay {
    id: string; // The award event ID
    dTag: string; // The badge's unique d tag
    name: string;
    description: string;
    image: string;
    issuerPubkey: string;
    issuerName?: string;
}

export function useProfileBadges(ndk: NDK | undefined, pubkey: string) {
    const [badges, setBadges] = useState<BadgeDisplay[]>([]);
    const [loadingBadges, setLoadingBadges] = useState(true);
    const loadingRef = useRef(false);

    const fetchBadges = useCallback(async () => {
        if (!ndk || !pubkey) return;
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoadingBadges(true);
        try {
            // 1) Find badge award events (kind 8) where p = pubkey
            const awardFilter: NDKFilter = {
                kinds: [8],
                '#p': [pubkey],
            };
            const awardEvents = await ndk.fetchEvents(awardFilter);

            // 2) Find this user's accepted badges (kind 30008)
            const profileBadgeFilter: NDKFilter = {
                kinds: [30008],
                authors: [pubkey],
                '#d': ['profile_badges'],
            };
            const acceptedEventsIter = await ndk.fetchEvents(profileBadgeFilter);
            const acceptedEvents = Array.from(acceptedEventsIter);

            // 3) Find the latest 30008
            let latestAcceptedEvent: NDKEvent | null = null;
            if (acceptedEvents.length > 0) {
                latestAcceptedEvent = acceptedEvents.reduce((prev, curr) => {
                    return (curr.created_at || 0) > (prev.created_at || 0) ? curr : prev;
                });
            }

            // 4) Extract a tags from the 30008 to find accepted badge definitions
            const acceptedATags = new Set<string>();
            if (latestAcceptedEvent) {
                latestAcceptedEvent.tags.forEach((t) => {
                    if (t[0] === 'a') {
                        acceptedATags.add(t[1]);
                    }
                });
            }

            // Filter awards to only those that are accepted
            const acceptedAwards = Array.from(awardEvents).filter((award) => {
                const aTag = award.tags.find((t) => t[0] === 'a')?.[1];
                if (!aTag) return false;
                return acceptedATags.has(aTag);
            });

            // 5) Fetch definitions (kind 30009) referenced by accepted awards
            const definitionCoordinatesText = acceptedAwards
                .map((a) => a.tags.find((t) => t[0] === 'a')?.[1])
                .filter(Boolean) as string[];

            const defsFilter: NDKFilter[] = definitionCoordinatesText.map((coord) => {
                const [, pub, dTag] = coord.split(':');
                return {
                    kinds: [30009],
                    authors: [pub],
                    '#d': [dTag],
                };
            });

            const processedBadges: BadgeDisplay[] = [];

            if (defsFilter.length > 0) {
                // Fetch definitions
                const definitionsIter = await ndk.fetchEvents(defsFilter);
                const definitions = Array.from(definitionsIter);

                // Fetch issuer profiles to get issuer names
                const issuerPubkeys = Array.from(new Set(definitions.map((d) => d.pubkey)));
                let issuerProfiles: NDKEvent[] = [];
                if (issuerPubkeys.length > 0) {
                    const profilesFilter: NDKFilter = { kinds: [0], authors: issuerPubkeys };
                    const pIter = await ndk.fetchEvents(profilesFilter);
                    issuerProfiles = Array.from(pIter);
                }

                const issuerMap = new Map<string, string>();
                for (const p of issuerProfiles) {
                    try {
                        const data = JSON.parse(p.content);
                        if (data.name || data.display_name) {
                            issuerMap.set(p.pubkey, data.display_name || data.name);
                        }
                    } catch { }
                }

                const definitionMap = new Map<string, NDKEvent>();
                definitions.forEach((def) => {
                    const dTag = def.tags.find((t) => t[0] === 'd')?.[1];
                    if (dTag) {
                        const coord = `30009:${def.pubkey}:${dTag}`;
                        definitionMap.set(coord, def);
                    }
                });

                processedBadges.push(
                    ...acceptedAwards
                        .map((award) => {
                            const aTag = award.tags.find((t) => t[0] === 'a')?.[1];
                            if (!aTag) return null;
                            const def = definitionMap.get(aTag);
                            if (!def) return null;

                            const dTag = def.tags.find((t) => t[0] === 'd')?.[1] || '';
                            const name = def.tags.find((t) => t[0] === 'name')?.[1] || '';
                            const description = def.tags.find((t) => t[0] === 'description')?.[1] || '';
                            const image = def.tags.find((t) => t[0] === 'image')?.[1] || '';
                            const issuerPubkey = def.pubkey;
                            const issuerName = issuerMap.get(issuerPubkey);

                            return {
                                id: award.id,
                                dTag,
                                name,
                                description,
                                image,
                                issuerPubkey,
                                issuerName,
                            };
                        })
                        .filter(Boolean) as BadgeDisplay[]
                );
            }

            setBadges(processedBadges);
        } catch (err) {
            console.error('Error fetching badges for profile:', err);
        } finally {
            setLoadingBadges(false);
            loadingRef.current = false;
        }
    }, [ndk, pubkey]);

    useEffect(() => {
        fetchBadges();
    }, [fetchBadges]);

    return { badges, loadingBadges, fetchBadges };
}

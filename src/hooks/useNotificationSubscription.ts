import { useState, useEffect } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';
import NDK from '@nostr-dev-kit/ndk';

export function useNotificationSubscription(
    ndk: NDK | undefined,
    user: { pubkey: string } | null,
    viewMode: string,
    allBlockedPubkeys: Set<string>,
    lastSeen: number,
    markAsRead: () => void
) {
    const [notifications, setNotifications] = useState<NDKEvent[]>([]);
    const [hasNewNotifs, setHasNewNotifs] = useState(false);

    useEffect(() => {
        if (!ndk || !user || viewMode !== 'notifications') return;
        let sub: import('@nostr-dev-kit/ndk').NDKSubscription | undefined;

        const startNotificationSub = async () => {
            const sinceTimestamp = Math.floor(Date.now() / 1000) - 86400 * 7;

            const filter: NDKFilter = {
                kinds: [1, 6, 7, 9735],
                '#p': [user.pubkey],
                since: sinceTimestamp,
                limit: 50,
            };

            sub = ndk.subscribe(filter, { closeOnEose: true, groupable: false });

            let notifBuffer: NDKEvent[] = [];
            let notifRafId: number | null = null;

            const flushNotifications = () => {
                notifRafId = null;
                if (notifBuffer.length === 0) return;
                const buffer = notifBuffer;
                notifBuffer = [];

                setNotifications((prev) => {
                    const combined = [...buffer, ...prev];
                    const uniqueById = Array.from(new Map(combined.map((item) => [item.id, item])).values());
                    const sorted = uniqueById
                        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
                        .slice(0, 50);

                    if (sorted.length > 0 && (sorted[0].created_at || 0) > lastSeen) {
                        setHasNewNotifs(true);
                    }
                    return sorted;
                });
            };

            sub.on('event', (ev: NDKEvent) => {
                const isTargetedToUs = ev.tags.some(
                    (t) => (t[0] === 'p' || t[0] === 'e') && t[1] === user.pubkey
                );
                if (!isTargetedToUs) return;
                if (ev.pubkey === user.pubkey || allBlockedPubkeys.has(ev.pubkey)) return;

                notifBuffer.push(ev);
                if (notifRafId === null) {
                    notifRafId = requestAnimationFrame(flushNotifications);
                }
            });

            sub.on('eose', () => {
                if (notifRafId !== null) cancelAnimationFrame(notifRafId);
                notifRafId = null;
                flushNotifications();
                markAsRead();
            });
        };

        startNotificationSub();
        return () => {
            if (sub) sub.stop();
        };
    }, [ndk, user, viewMode, allBlockedPubkeys, lastSeen, markAsRead]);

    return { notifications, hasNewNotifs, setHasNewNotifs };
}

import NDK, { NDKEvent, NDKRelaySet, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { filterRelays } from './relay';

const DISCOVERY_TIMEOUT_MS = 4000;

/**
 * Publishes an event to the author's inbox relays and the user's outbox relays.
 * Implementation of the requirement: 
 * "anytime a user replies or reacts to a note, the client should first check 
 * the relay config of the author, then send the notes to the inbox relay 
 * of the author and your own outbox relay"
 */
export async function publishWithDiscovery(
    ndk: NDK,
    event: NDKEvent,
    authorPubkey: string
) {
    const targetRelays = new Set<string>();

    // Use a promise list to parallelize the relay discovery
    const discoveryPromises: Promise<void>[] = [];

    // 1. Get Author's relays (Kind 10002) - Inbox
    discoveryPromises.push(
        (async () => {
            try {
                const authorEvents = await ndk.fetchEvents(
                    { kinds: [10002], authors: [authorPubkey] },
                    { cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST }
                );

                if (authorEvents.size > 0) {
                    const relayListEvent = Array.from(authorEvents)[0];
                    relayListEvent.tags.forEach((tag) => {
                        if (tag[0] === 'r') {
                            const url = tag[1];
                            const type = tag[2]; // 'read', 'write', or undefined (both)
                            // NIP-65: 'read' means inbox
                            if (!type || type === 'read') {
                                targetRelays.add(url);
                            }
                        }
                    });
                }
            } catch (err) {
                console.warn(`Failed to discover author relays for ${authorPubkey}:`, err);
            }
        })()
    );

    // 2. Get User's own outbox relays (Kind 10002) - Outbox
    const signer = ndk.signer;
    if (signer) {
        discoveryPromises.push(
            (async () => {
                try {
                    const user = await signer.user();
                    const userEvents = await ndk.fetchEvents(
                        { kinds: [10002], authors: [user.pubkey] },
                        { cacheUsage: NDKSubscriptionCacheUsage.CACHE_FIRST }
                    );

                    if (userEvents.size > 0) {
                        const relayListEvent = Array.from(userEvents)[0];
                        relayListEvent.tags.forEach((tag) => {
                            if (tag[0] === 'r') {
                                const url = tag[1];
                                const type = tag[2]; // 'read', 'write', or undefined (both)
                                // NIP-65: 'write' means outbox
                                if (!type || type === 'write') {
                                    targetRelays.add(url);
                                }
                            }
                        });
                    }
                } catch (err) {
                    console.warn("Failed to discover user's own relays:", err);
                }
            })()
        );
    }

    // Wait for both discoveries, but don't hang forever if a relay never sends
    // EOSE — cap the wait and fall back to connected relays below.
    const discoveryTimeout = new Promise<void>((resolve) =>
        setTimeout(resolve, DISCOVERY_TIMEOUT_MS)
    );
    await Promise.race([Promise.allSettled(discoveryPromises), discoveryTimeout]);

    // 3. Add currently connected relays as the user's "own outbox" fallback.
    // This satisfies the "and your own outbox relay" requirement.
    ndk.pool.relays.forEach((_, url) => {
        targetRelays.add(url);
    });

    // The author-supplied relay URLs are untrusted, so run everything through the
    // app's relay filter (drops .onion / localhost / blacklisted / insecure ws)
    // rather than only checking the "ws" prefix.
    const relayUrls = filterRelays(Array.from(targetRelays).filter((url) => url.startsWith('ws')));

    if (relayUrls.length === 0) {
        // Nothing safe to target — fall back to the default publish path.
        return event.publish();
    }

    console.log(`Publishing to discovered relays: ${relayUrls.join(', ')}`);

    // Publish to specific RelaySet
    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    return event.publish(relaySet);
}

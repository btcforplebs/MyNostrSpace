export const isOnion = (url: string): boolean => {
  return url.toLowerCase().includes('.onion');
};

export const filterRelays = (relays: string[]): string[] => {
  const BLACKLIST = [
    '.onion',
    'nostr.mutinywallet.com',
    'wot.utxo.one',
    'ditto.pub',
    // 'relay.nostr.band', // Sometimes good, but causing bad response errors now. Keep if needed? Let's filter for now.
    'relay.nostr.band',
  ];

  return relays.filter((r) => {
    const lower = r.toLowerCase();
    return !BLACKLIST.some((b) => lower.includes(b));
  });
};

export const APP_RELAYS = {
  DEFAULT: [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://purplepag.es',
    'wss://relay.btcforplebs.com',
  ],
  MEDIA: ['wss://relay.satellite.earth', 'wss://nostr.wine', 'wss://nostr-pub.wellorder.net'],
  DISCOVERY: ['wss://nos.lol', 'wss://relay.damus.io', 'wss://relay.primal.net'],
  MARKETPLACE: [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://relay.nostr.net',
    'wss://nostr.wine',
    'wss://relay.nostr.band', // Note: This is blacklisted in filterRelays, but ALL_INITIAL_RELAYS uses filterRelays.
  ],
  SEARCH: [
    'wss://purplepag.es',
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
  ],
  STREAMING: [
    'wss://relay.zap.stream',
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://relay.primal.net',
  ],
};

// Unified list for global NDK initialization
export const ALL_INITIAL_RELAYS = filterRelays([
  ...APP_RELAYS.DEFAULT,
  ...APP_RELAYS.MEDIA,
  ...APP_RELAYS.DISCOVERY,
  ...APP_RELAYS.MARKETPLACE,
  ...APP_RELAYS.SEARCH,
]);

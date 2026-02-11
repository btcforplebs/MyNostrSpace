export const isOnion = (url: string): boolean => {
  return url.toLowerCase().includes('.onion');
};

export const filterRelays = (relays: string[]): string[] => {
  const BLACKLIST = [
    '.onion',
    'nostr.mutinywallet.com',
    'wot.utxo.one',
    'ditto.pub',
    'relay.nostr.band',
    'peimal.net',
    'zap.stream',
    '127.0.0.1',
    'localhost',
  ];

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  return relays.filter((r) => {
    const lower = r.toLowerCase();
    const isInsecureWs = isHttps && lower.startsWith('ws://');
    const isBlacklisted = BLACKLIST.some((b) => lower.includes(b));
    return !isInsecureWs && !isBlacklisted;
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
    'wss://antiprimal.net',
  ],
  MEDIA: ['wss://relay.satellite.earth', 'wss://nostr.wine', 'wss://nostr-pub.wellorder.net'],
  DISCOVERY: ['wss://nos.lol', 'wss://relay.damus.io', 'wss://relay.primal.net'],
  MARKETPLACE: [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://relay.nostr.net',
    'wss://nostr.wine',
  ],
  SEARCH: ['wss://antiprimal.net'],
  STREAMING: [
    'wss://relay.zap.stream',
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://relay.primal.net',
  ],
};

// Unified list for global NDK initialization
export const ALL_INITIAL_RELAYS = filterRelays(
  Array.from(
    new Set([
      ...APP_RELAYS.DEFAULT,
      ...APP_RELAYS.MEDIA,
      ...APP_RELAYS.DISCOVERY,
      ...APP_RELAYS.MARKETPLACE,
      ...APP_RELAYS.SEARCH,
      ...APP_RELAYS.STREAMING,
    ])
  )
);

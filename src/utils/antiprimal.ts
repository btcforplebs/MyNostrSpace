export const ANTIPRIMAL_RELAY = 'wss://antiprimal.net';
export const PRIMAL_CACHE_RELAY = 'wss://cache.primal.net/v1';

export const PRIMAL_BOT_NPUB = 'npub19qs86y2dasgyd3q2m8v0tvkcdc8ywrjvplp4wwwpweul42xlg56qxjh3jt';

// Hex pubkey for 30383 queries
// Decoded: 9e061845bb07dc4551152a5786a3449174154fa72a74c2642d201112b05d15a5
export const PRIMAL_BOT_PUBKEY = '9e061845bb07dc4551152a5786a3449174154fa72a74c2642d201112b05d15a5';

export const isAntiprimal = (url: string) => {
  return url.includes('antiprimal.net') || url.includes('primal.net');
};

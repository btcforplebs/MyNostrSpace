import NDK, { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';

const DEFAULT_BLOSSOM_SERVERS = [
  'https://nostr.build',
  'https://blossom.primal.net',
  'https://satellite.earth',
  'https://void.cat',
];

/**
 * Fetches the user's Blossom servers from Kind 10063 and combines with defaults.
 */
export const getBlossomServers = async (ndk: NDK, pubkey: string): Promise<string[]> => {
  let userServers: string[] = [];
  try {
    const filter = { kinds: [10063 as NDKKind], authors: [pubkey], limit: 1 };
    const event = await ndk.fetchEvent(filter);
    if (event) {
      userServers = event.tags.filter((t) => t[0] === 'server').map((t) => t[1]);
    }
  } catch (e) {
    console.warn('Failed to fetch user blossom servers:', e);
  }
  // Return user servers followed by defaults for maximum reliability
  return [...new Set([...userServers, ...DEFAULT_BLOSSOM_SERVERS])];
};

/**
 * Calculates SHA-256 hash of a file.
 */
const calculateSha256 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Uploads a file to a Blossom server using NIP-98 authentication.
 *
 * @param ndk The NDK instance
 * @param file The file to upload
 * @param servers Optional list of Blossom server URLs
 * @returns The uploaded file URL and metadata
 */
export const uploadToBlossom = async (
  ndk: NDK,
  file: File,
  servers?: string[]
): Promise<{ url: string; [key: string]: unknown }> => {
  if (!ndk.signer) {
    throw new Error('NDK signer is required for NIP-98 upload');
  }

  const user = await ndk.signer.user();
  const targetServers = servers || (await getBlossomServers(ndk, user.pubkey));
  const sha256 = await calculateSha256(file);

  console.log(`Starting upload to ${targetServers.length} possible Blossom servers...`);

  let lastError: Error | null = null;

  for (const server of targetServers) {
    const cleanServer = server.endsWith('/') ? server.slice(0, -1) : server;

    // We'll try different upload strategies for each server
    // 1. Khatru/Haven style (PUT /upload, Kind 24242)
    // 2. Standard Blossom style (PUT /<sha256>, Kind 27235)
    const strategies = [
      {
        name: 'Khatru',
        url: `${cleanServer}/upload`,
        method: 'PUT',
        kind: 24242,
        tags: [
          ['t', 'upload'],
          ['expiration', (Math.floor(Date.now() / 1000) + 3600).toString()], // 1 hour expiration
        ],
      },
      {
        name: 'Standard',
        url: `${cleanServer}/${sha256}`,
        method: 'PUT',
        kind: 27235,
        tags: [
          ['u', `${cleanServer}/${sha256}`],
          ['method', 'PUT'],
          ['x', sha256],
        ],
      },
    ];

    for (const strategy of strategies) {
      try {
        console.log(`Attempting ${strategy.name} upload to ${strategy.url}...`);

        // 1. Create the authorization event
        const authEvent = new NDKEvent(ndk);
        authEvent.kind = strategy.kind as NDKKind;
        authEvent.content = '';
        authEvent.tags = [...strategy.tags, ['client', 'MyNostrSpace']];

        await authEvent.sign();
        const signedEvent = await authEvent.toNostrEvent();

        // Check for clock drift
        const drift = Math.abs((signedEvent.created_at || 0) - Math.floor(Date.now() / 1000));
        if (drift > 60) {
          console.warn(`Clock drift detected: ${drift}s. Target: ${strategy.url}`);
        }

        // Robust base64 encoding
        const eventJson = JSON.stringify(signedEvent);
        const authHeader = `Nostr ${btoa(unescape(encodeURIComponent(eventJson)))}`;

        // 2. Send the request
        const response = await fetch(strategy.url, {
          method: 'PUT',
          headers: {
            Authorization: authHeader,
            'Content-Type': file.type,
          },
          body: file,
        });

        if (!response.ok) {
          const text = await response.text();
          console.warn(`${strategy.name} upload to ${server} failed (${response.status}): ${text}`);
          continue; // Try next strategy
        }

        const data = await response.json();
        console.log(`${strategy.name} upload success on ${server}!`, data);

        // Normalize response
        const resultUrl =
          data.url ||
          (Array.isArray(data.data) ? data.data[0]?.url : data.data?.url) ||
          data.descriptor?.url ||
          data[0]?.url;
        if (resultUrl) return { ...data, url: resultUrl };

        return { url: resultUrl || data };
      } catch (e) {
        console.warn(`${strategy.name} strategy error on ${server}:`, e);
        lastError = e as Error;
      }
    }
  }

  throw lastError || new Error('All Blossom servers failed to upload. Check console for details.');
};

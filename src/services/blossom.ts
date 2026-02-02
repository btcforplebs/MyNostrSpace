import NDK, { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';

/**
 * Uploads a file to a Blossom server using NIP-98 authentication.
 *
 * @param ndk The NDK instance
 * @param file The file to upload
 * @param serverUrl The Blossom server URL (default: https://nostr.build)
 * @returns The uploaded file URL and metadata
 */
export const uploadToBlossom = async (
  ndk: NDK,
  file: File,
  serverUrl: string = 'https://nostr.build'
): Promise<{ url: string; [key: string]: unknown }> => {
  if (!ndk.signer) {
    throw new Error('NDK signer is required for NIP-98 upload');
  }

  // 1. Create the authorization event (Kind 27235)
  // See NIP-98: https://github.com/nostr-protocol/nips/blob/master/98.md
  const authEvent = new NDKEvent(ndk);
  authEvent.kind = 27235 as NDKKind;
  authEvent.content = '';
  authEvent.tags = [
    ['u', `${serverUrl}/upload`],
    ['method', 'PUT'], // or POST, depending on server implementation. Blossom usually uses PUT or POST for upload. Standard Blossom is often PUT /upload or POST /upload. Let's try POST to /api/v2/upload/files for nostr.build or standard /upload
  ];
  // Note: nostr.build V2 API uses different endpoints.
  // Let's assume standard Blossom implementation:
  // POST /upload  (some use PUT which is idempotent)
  // To be safe, let's use the standard route.

  // For this implementation, let's target the generic Blossom spec:
  // Authorization header: Nostr <base64(event)>

  // Adjusting tags for generic Blossom
  authEvent.tags = [
    ['u', `${serverUrl}/upload`],
    ['method', 'POST'],
  ];

  await authEvent.sign();
  const authHeader = `Nostr ${btoa(JSON.stringify(authEvent.rawEvent()))}`;

  // 2. Prepare the upload
  const formData = new FormData();
  formData.append('file', file);

  // 3. Send request
  const response = await fetch(`${serverUrl}/upload`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  // Blossom usually returns { url: ... } or { descriptor: { ... } }
  // nostr.build returns { data: [{ url: ... }] } in v2

  // Attempt to normalize
  if (data.url) return data;
  if (data.data && Array.isArray(data.data) && data.data[0].url) return data.data[0]; // nostr.build v2 style

  return data;
};

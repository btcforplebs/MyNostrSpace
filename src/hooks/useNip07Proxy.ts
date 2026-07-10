import { useEffect, type RefObject } from 'react';

/**
 * Bridges a sandboxed third-party iframe to the user's NIP-07 extension over
 * postMessage, so embedded games/rooms can request a pubkey, sign events, etc.
 *
 * Security model:
 * - The embedded app's origin is derived from `appUrl`. Every inbound message
 *   must come from BOTH the iframe's window AND that exact origin, so a page the
 *   iframe navigates itself to (on any other origin) cannot reach the bridge.
 * - Responses are posted back with that exact origin as targetOrigin, never '*',
 *   so results (pubkey, decrypted text) can't leak to a different loaded origin.
 * - nip04 encrypt/decrypt is gated behind an explicit user confirmation: many
 *   extensions decrypt silently, so without this an embedded app could read the
 *   user's private DMs. signEvent relies on the extension's own approval prompt.
 */
export const useNip07Proxy = (
  iframeRef: RefObject<HTMLIFrameElement | null>,
  appUrl: string | null | undefined
) => {
  useEffect(() => {
    if (!appUrl) return;

    let allowedOrigin: string;
    try {
      allowedOrigin = new URL(appUrl).origin;
    } catch {
      // Unparseable app URL — never open the bridge.
      return;
    }

    const handleMessage = async (event: MessageEvent) => {
      const frame = iframeRef.current;
      // Must originate from the embedded frame AND its expected origin.
      if (!frame || event.source !== frame.contentWindow) return;
      if (event.origin !== allowedOrigin) return;

      const { type, id, payload } = event.data || {};
      if (!type || typeof type !== 'string' || !type.startsWith('nip07')) return;

      const respond = (message: Record<string, unknown>) =>
        frame.contentWindow?.postMessage({ id, ...message }, allowedOrigin);

      if (!window.nostr) {
        respond({ error: 'Nostr extension not found' });
        return;
      }

      try {
        let result;
        switch (type) {
          case 'nip07.getPublicKey':
            result = await window.nostr.getPublicKey();
            break;
          case 'nip07.signEvent':
            result = await window.nostr.signEvent(payload);
            break;
          case 'nip07.getRelays':
            if (window.nostr.getRelays) {
              result = await window.nostr.getRelays();
            } else {
              throw new Error('getRelays not supported');
            }
            break;
          case 'nip07.nip04.encrypt':
            if (!window.nostr.nip04?.encrypt) throw new Error('nip04.encrypt not supported');
            if (
              !confirm(
                `"${allowedOrigin}" wants to encrypt a message with your key. Allow?`
              )
            ) {
              throw new Error('User denied nip04.encrypt');
            }
            result = await window.nostr.nip04.encrypt(payload.pubkey, payload.plaintext);
            break;
          case 'nip07.nip04.decrypt':
            if (!window.nostr.nip04?.decrypt) throw new Error('nip04.decrypt not supported');
            if (
              !confirm(
                `"${allowedOrigin}" wants to decrypt a message with your key. This can expose your private messages. Allow?`
              )
            ) {
              throw new Error('User denied nip04.decrypt');
            }
            result = await window.nostr.nip04.decrypt(payload.pubkey, payload.ciphertext);
            break;
          default:
            throw new Error(`Unknown method: ${type}`);
        }

        respond({ result });
      } catch (err) {
        respond({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeRef, appUrl]);
};

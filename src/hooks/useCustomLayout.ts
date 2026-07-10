import { useEffect, useState } from 'react';
import { useNostr } from '../context/NostrContext';

/**
 * A viewed profile's custom CSS is attacker-controlled and gets injected into the
 * visitor's page, so strip the constructs that let it attack the whole site:
 * <style> breakout, @import (external fetch/exfiltration), fixed/sticky overlays
 * (clickjacking / fake login prompts), and legacy script vectors. Colors, fonts,
 * and background images — the actual customization — are left intact.
 */
const sanitizeCustomCss = (css: string): string =>
  css
    .replace(/<\/?(style|script)[^>]*>?/gi, '')
    .replace(/<!--|-->/g, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '/* blocked */(')
    .replace(/-moz-binding\s*:[^;]*;?/gi, '')
    .replace(/behavior\s*:[^;]*;?/gi, '')
    .replace(/position\s*:\s*(fixed|sticky)/gi, 'position:static');

export const useCustomLayout = (pubkey?: string) => {
  const { ndk } = useNostr();
  const [layoutUrl, setLayoutUrl] = useState<string | null>(null);
  const [layoutCss, setLayoutCss] = useState<string | null>(null);

  useEffect(() => {
    if (!ndk || !pubkey) return;

    const fetchLayout = async () => {
      try {
        let hexPubkey = pubkey;
        if (pubkey.startsWith('npub') || pubkey.startsWith('nprofile')) {
          const tempUser = ndk.getUser({
            [pubkey.startsWith('npub') ? 'npub' : 'nprofile']: pubkey,
          });
          hexPubkey = tempUser.pubkey;
        }

        // Fetch Kind 30078 with d=mynostrspace_layout
        const event = await ndk.fetchEvent({
          kinds: [30078 as number],
          authors: [hexPubkey],
          '#d': ['mynostrspace_layout'],
        });

        if (event) {
          // 1. Check direct content (preferred for CSS editor)
          if (event.content && event.content.trim().length > 0) {
            setLayoutCss(sanitizeCustomCss(event.content));
          }
          // 2. Fallback to URL tag if content is empty
          else {
            const url = event.tags.find((t) => t[0] === 'url')?.[1];
            if (url) {
              setLayoutUrl(url);
              // Fetch the content immediately to inject
              const res = await fetch(url);
              const txt = await res.text();
              setLayoutCss(sanitizeCustomCss(txt));
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch custom layout', e);
      }
    };

    fetchLayout();
  }, [ndk, pubkey]);

  return { layoutUrl, layoutCss };
};

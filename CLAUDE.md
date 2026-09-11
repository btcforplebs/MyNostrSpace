# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # requires legacy-peer-deps (set via .npmrc) for React 19 compat
npm run dev           # Vite dev server
npm run build         # tsc -b && vite build (type-check then bundle)
npm run lint          # eslint .
npm run format        # prettier --write .
npm run format:check  # prettier --check .
npm run preview       # preview a production build locally
```

There is no test suite/script in this repo.

Docker: `docker-compose up --build -d` serves the production build via `server.js` on port 6767 (multi-stage `Dockerfile`, `nginx.conf` for SPA routing/CSP).

## Architecture

This is a client-heavy React 19 + TypeScript SPA (Vite) that recreates a MySpace-style social network entirely on top of the **Nostr protocol** — there is no app-specific backend/database; all data (profiles, posts, follows, DMs, badges, etc.) is read from and written to Nostr relays.

- **`src/context/NostrContext.tsx`** is the root of the app's data layer. It owns a single long-lived `NDK` instance (from `@nostr-dev-kit/ndk`) with an IndexedDB cache adapter (`ndk-cache-dexie`, db name `mynostrspace-ndk-cache`), the user's relay list (persisted to `localStorage` under `mynostrspace_relays`), and auth state. Consume it via the `useNostr()` hook rather than reaching for NDK directly.
- **Auth has two paths**, both funnelled through `NostrContext`:
  - NIP-07 browser extension signing (`NDKNip07Signer`), auto-restored on load if `mynostrspace_pubkey` is in `localStorage`.
  - NIP-46 remote signer/"bunker" (`src/lib/nip46-client.ts`), auto-reconnected from `mynostrspace_semiconnected_bunker`. Login state, relay list, and cached DM plaintext are all persisted client-side and explicitly purged on `logout()` — cross-account leakage of decrypted DMs is treated as a real risk here (see `clearAllMessages()`).
- **Routing/pages**: `src/App.tsx` route-lazy-loads one page component per feature area under `src/components/<Feature>/` (Profile, Messages, Rooms, Music, Film, Marketplace, Calendar, Badges, Live, etc.). Vendor code is manually chunked in `vite.config.ts` (`react-vendor`, `nostr-vendor`) specifically to keep the logged-out `LandingPage`'s first paint light.
- **Data fetching** is hook-driven: `src/hooks/` has one hook per subscription/query concern (`useFeedSubscription`, `useProfile`, `useFollows`, `useMessages`, `useNotificationSubscription`, etc.), generally wrapping NDK subscriptions plus the caches in `src/hooks/profileCache.ts` / `statsCache.ts` and `src/services/messageCache.ts`.
- **`src/utils/`** holds Nostr protocol details split out from UI/hooks: `nip44.ts`/`nip17.ts` (encrypted DMs), `signerEncryption.ts`, `relay.ts` (relay list filtering — `ALL_INITIAL_RELAYS`/`filterRelays`, used by `NostrContext`), `publishWithDiscovery.ts`, `mentions.ts`, `antiprimal.ts`, `blockedUsers.ts`.
- **`src/services/blossom.ts`** handles media uploads via the Blossom protocol (profile backgrounds, photos, etc.).
- **Server-side rendering shim**: `server.js` is *not* a real SSR server — it serves the static `dist/` build, but for bot user agents hitting `/p/:id` (profile) or `/thread/:id` routes it fetches the relevant Nostr event/profile from a hardcoded relay pool (via `nostr-tools`' `SimplePool`) and rewrites `<title>`/OG/Twitter meta tags into the cached `index.html` before responding, so link previews work despite the SPA being client-rendered. Keep this relay pool and the bot-detection regex in mind if debugging broken social-card previews.
- Custom per-profile theming (CSS editor, "Classic MySpace/Matrix/Y2K Glitter/Emo/GeoCities/Cyberpunk" presets) lives under `src/components/Customization/`.

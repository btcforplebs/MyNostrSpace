# Changelog

All notable changes to the MyNostrSpace project will be documented in this file.

## [Unreleased] - 2026-02-23

### ⚡ Performance Optimizations

#### **Feed Performance Overhaul**
- **Lightweight Threading**: Replaced heavy inline thread expansion logic in `FeedItem.tsx` with lightweight `note1` direct links. This prevents every feed item from making separate 5-10 second subscription requests, resulting in instant homepage loads.
- **State Reduction**: Removed all inline thread state (`replies`, `loadingThread`, `showThread`) from `FeedItem`, reducing CPU usage and memory pressure on the initial feed mount.
- **Files modified:** `FeedItem.tsx`, `FeedItems.tsx`

### 🚀 New Features

#### **High-Resilience Thread View**
- **Instant Note Loading**: Refactored `ThreadPage.tsx` to display the specific event you clicked on immediately, while climbing the thread chain in the background.
- **Recursive Root Discovery**: Implemented a background "climber" that follows `e` tags up the chain to find and display the absolute origin of a discussion thread, no matter where you enter.
- **O(N) Tree Building**: Optimized threaded rendering to use a Map-based O(N) approach instead of O(N^2) searches, ensuring smooth scrolling in massive threads.
- **Bech32 & Relay Hint Support**: Added full decoding for `nevent1` pointers, automatically utilizing embedded relay hints to find content across the wider Nostr network.
- **Files modified:** `ThreadPage.tsx`

#### **Robust Share Feature**
- **Dynamic Pointer Generation**: Added a "Share" button to `InteractionBar.tsx` that generates an `nevent1` pointer (including hints for your current active relays).
- **Social Preview Optimization**: The generated pointers ensure social media bots and other clients can always find the content, even if it hasn't propagated to major relays yet.
- **Files modified:** `InteractionBar.tsx`

### 🛠 SSR & SEO Improvements

#### **Universal Bech32 Support**
- **Node.js Metadata Injector**: Updated `server.js` to support all major Nostr bech32 formats (`npub`, `note`, `naddr`, `nevent`, `nprofile`).
- **Hint-Aware Bot Fetching**: The bot fetcher now extracts and prioritizes relay hints from `nevent` and `nprofile` pointers, ensuring rich previews (titles, images, snippets) work reliably for shared links.
- **Files modified:** `server.js`

### 🐛 Bug Fixes

#### **Thread Security & Filtering**
- **Mute List Enforcement**: Centralized `isBlockedUser` and `hasBlockedKeyword` checks in the thread view to ensure content from muted users is correctly filtered.
- **Fixed Blocked Logic**: Resolved a bug where blocking was being applied inconsistently based on event IDs instead of pubkeys.
- **Files modified:** `ThreadPage.tsx`, `FeedItems.tsx`

## [Unreleased] - 2026-02-14

### ⚡ Performance Optimizations

#### **Virtualization & Lazy Embedding**

- Implemented **Feed Item Virtualization** and IntersectionObserver-based loading for improved scroll performance in long feeds.
- **Lazy Video Embedding**: Deferred YouTube/Wavlake/Video iframe creation until they enter the viewport to reduce initial DOM pressure and memory usage.
- **Optimized Subscriptions**: Refined subscription limits and implemented more aggressive event batching to prevent UI jank during high-frequency network updates.
- **Deterministic Avatars**: Memoized color generation and improved identification fallback logic in `Avatar.tsx`.
- **Files modified:** `HomePage.tsx`, `FeedItem.tsx`, `RichTextRenderer.tsx`, `ThreadPage.tsx`, `Avatar.tsx`, `NostrContext.tsx`, `index.css`

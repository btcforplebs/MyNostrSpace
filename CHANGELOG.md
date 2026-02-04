# Changelog

All notable changes to the MyNostrSpace project will be documented in this file.

## [Unreleased] - 2026-02-04

### 🚀 Major Features

#### **New Pages & Routing**
- **Film Page** (`src/components/Film/`):
    - Added `FilmPage.tsx` to display a grid of movies fetched from a specific NPUB.
    - Implemented video playback for movie entries.
- **Blogs** (`src/components/Blog/`):
    - Created `BlogsPage.tsx` for a global feed of long-form articles (Kind 30023).
    - Created `BlogPage.tsx` for viewing individual articles.
    - Added CSS modules `BlogsPage.css` and `BlogPage.css`.
- **Videos** (`src/components/Video/`):
    - **Advanced Video Parsing**: Refactored `VideosPage.tsx` to parse Kind 1 events for disparate video sources including:
        - Direct file links (`.mp4`, `.mov`, `.webm`, `.m3u8`, etc.) with `canvas`-based thumbnail generation.
        - `imeta` tag parsing for NIP-94 style attachments.
        - Third-party hosting text parsing for YouTube, Vimeo, and Streamable.
    - Implemented infinite scroll with load tracking to prevent duplicate fetching loops.
    - Added `VideosPage.css` with responsive grid layout.
- **Marketplace** (`src/components/Marketplace/`):
    - Added `MarketplacePage.tsx` and `MarketplacePage.css` for product listings.
- **Calendar** (`src/components/Calendar/`):
    - **Note Viewing by Date**: Implemented `CalendarPage.tsx` to visualize a user's Kind 1 (Notes) and Kind 30023 (Articles) events in a monthly calendar view.
    - Interactive calendar grid where clicking a day reveals all posts from that specific date.
- **Settings** (`src/components/Settings/`):
    - Added `SettingsPage.tsx` which consolidates previous relay settings and adds profile management.
    - Removed standalone `RelaySettings.tsx` locally in favor of the unified page.
- **Live Streams** (`src/components/Live/`):
    - Implemented `LiveStreamPage.tsx` with HLS.js integration for streaming.
    - Added `LivestreamsPage.tsx` for a directory of active streams.
    - Added `ChatMessage.tsx` for live chat integration.
    - **Refactor**: Simplified connection logic, removing browser-specific hacks and unifying `STREAM_RELAYS`.
- **App Routing**:
    - Updated `App.tsx` with routes for all new pages (`/film`, `/blog/:naddr`, `/videos`, `/marketplace`, `/calendar`, `/settings`).
    - Implemented **Route-based Code Splitting** using `React.lazy` and `Suspense`.

#### **Profile Personalization**
- **Profile CSS Editor** (`src/components/Customization/LayoutEditor.tsx`):
    - Implemented a full code editor for users to write custom CSS (Kind 30078) to style their profile.
    - **Theme Presets**: Added one-click themes including Classic MySpace, Matrix, Y2K Glitter, Emo/Scene, GeoCities, and Cyberpunk 2077.
    - **Background Uploads**: Integrated direct image uploading for custom profile backgrounds using Blossom.

#### **Media & Uploads**
- **Blossom Service Integration** (`src/components/Home/MediaUpload.tsx`, `src/services/blossom.ts`):
    - Implemented **NIP-98 Authenticated Uploads** to Blossom servers (supporting both standard and specific implementations like Khatru).
    - Added fallback multi-server upload strategies.
    - **Universal Media Uploader**: Created `MediaUpload` component for uploading Photos and Videos, which automatically publishes:
        - **Kind 1063** (File Metadata) for indexing.
        - **Kind 1** (Text Note) for feed visibility.

#### **Home Page Overhaul** (`src/components/Home/`)
- Completely refactored `HomePage.tsx` to support distinct views: `feed`, `gallery`, `blogs`, `music`, `videos`.
- Implemented **"Cool New People"** section with horizontal scrolling profiles.
- Added `BlogEditor.tsx` for creating long-form content directly from the home feed.
- Added `useCustomLayout` support to allow consistent theming across sub-pages and persistent user themes.

#### **Search & Discovery** (`src/components/Search/`)
- **SearchPage Refactor**:
    - Completely rewrote `SearchPage.tsx` to support searching specifically for people (Kind 0) and notes (Kind 1).
    - Added tabbed interface for switching between result types.
    - Integrated `FeedItem` for rendering search results.
    - Fixed dead relay issues and optimized query performance.

#### **Client Tag Identification (NIP-89)**
- Implemented automated injection of the client tag (`31990:client_pubkey`) into:
    - **Kind 1** (Short Notes)
    - **Kind 30023** (Long-form Articles)
    - **Kind 30311** (Live Streams)
- Ensures all content created via the app is properly attributed to the MyNostrSpace client.

### 🎨 UI/UX & Components

- **Navbar** (`src/components/Shared/Navbar.tsx`):
    -  Complete rewrite to support the new multi-page structure.
    -  Adaptive state for logged-in vs public views.
    -  Fixed layout shifts and integration issues on the Homepage.
- **Avatar** (`src/components/Shared/Avatar.tsx`):
    - Created a reusable `Avatar` component to standardize user profile image rendering across the app.
- **Rich Text Renderer** (`src/components/Shared/RichTextRenderer.tsx`):
    - Enhanced parsing for better media embedding.
    - Added `loading="lazy"` to all rendered images/iframes.
- **Feed Item** (`src/components/Shared/FeedItem.tsx`):
    - Improved layout and interaction handling.
    - Implemented lazy loading for media attachments.
- **Interaction Bar** (`src/components/Shared/InteractionBar.tsx`):
    - Refactored to handle Zaps, Likes, and Reposts more robustly.

### 🛠 Technical & Performance

- **Lazy Loading**:
    - Implemented `loading="lazy"` attributes on `img` and `iframe` tags globally.
    - Added `Suspense` boundaries for route components.
- **NIP-46 (Bunker) Client**:
    - Hardened security by removing secrets from connection strings before storage.
    - Fixed persistent login state issues.
    - Added error handling for RPC publications.
- **Profile Fetching**:
    - Refactored `useProfile` and `useExtendedProfile` hooks to be more efficient and robust.
- **Scripts**:
    - Added debug scripts: `debug_stream.ts`, `debug_naddr.ts`, `analyze_movie_events.ts`, `inspect_npub.ts`.

### 🐛 Bug Fixes

- **Infinite Loops**: Fixed a critical infinite loop bug in `VideosPage.tsx` caused by improper state dependencies in `useEffect`.
- **Safari Playback**: Resolved WebSocket and HLS playback issues specifically affecting Safari users on `LiveStreamPage`.
- **Marketplace Images**: Added fallback handlers for broken images in `MarketplacePage`.
- **Navigation**: Fixed missing "Reviews" link in the Navbar.
- **Linting**: Applied global lint fixes, resolving React hook dependency warnings and type safety issues.

---

## [Legacy / Previous Work]

### Core Systems
- **Nostr Context**: Established `NostrContext.tsx` for global state management.
- **NDK Integration**: Integrated NDK for robust Nostr event handling.

### Initial UI
- **Landing Page**: Created the initial `LandingPage.tsx` with dynamic content feeds and Wavlake player integration.
- **Wavlake Player**: Implemented retro-style music player (`WavlakePlayer.tsx`).

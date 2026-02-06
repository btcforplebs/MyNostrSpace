# Changelog

All notable changes to the MyNostrSpace project will be documented in this file.

## [Unreleased] - 2026-02-06

### 🚀 New Features

#### **Browse Page Redesign**
- Complete refactor to use shared LandingPage.css styling for consistency
- Added **Categories Grid** with 12 content categories (Videos, Audio Rooms, Music, Marketplace, Livestreams, Blogs, Recipes, Photos, Badges, Search, Calendar, Film)
- Reorganized layout: sidebar with categories + popular sites, main content with people grid + global feed
- Added skeleton loading states for people grid during data fetching
- Simplified CSS (170+ lines → ~5 lines, inheriting from LandingPage.css)

#### **Profile Badges Display**
- Added **ProfileBadges** component to display user's Nostr badges (NIP-58)
- Fetches Kind 30008 (profile_badges) and Kind 30009 (badge definitions)
- Displays badges as 40x40px icons with hover tooltips showing name and description
- Automatically fetches and displays issuer information
- Only renders when user has badges to show

#### **Wall Post Recipient Display**
- Added visual indicator for wall posts showing "Author → Recipient"
- Implemented in both feed items and comment walls
- Uses new `WallRecipient` component with arrow styling
- Helps distinguish wall posts from regular notes and replies
- Only shows for non-reply Kind 1 events with exactly 1 p-tag

### 🎨 UI/UX Enhancements

#### **Livestream Page Improvements**
- Complete layout restructure using home-page-container wrapper for consistency
- Increased chat window height (300px → 400px) for better readability
- Changed chat background to white for cleaner appearance
- Improved width/margin handling (100% width with max-width constraint)
- Better container structure with proper border handling

#### **Cross-Platform Livestream Chat**
- Enhanced chat functionality to work across different Nostr streaming platforms
- Explicitly connects to streaming relays before subscribing and publishing
- Uses stream author's pubkey and d-tag for proper cross-platform tagging
- Improved zap request handling with explicit relay publishing
- Better host detection using p-tag when available
- Increased chat limit from 50 → 100 messages for better history

#### **Film Page Relay Management**
- Switched from isolated NDK instance to global NDK pool
- Explicitly adds film relays (nostr.mom, nos.lol, relay.damus.io) to connection pool
- Added debug logging for relay connectivity troubleshooting
- Better loading state handling with flush buffer logic

#### **Audio Room Filtering**
- Livestreams page now filters out audio rooms (Corny Chat, Nostr Nests)
- Prevents duplicate listings across different sections

### 🛠 Technical Improvements

#### **Layout Consistency**
- Livestreams page now uses home-page-container wrapper
- Consistent structure across Live, Livestream, and Profile pages
- Better responsive design with unified CSS approach

#### **CSS Cleanup**
- Browse page CSS reduced from 175 lines to 5 lines
- Reuses LandingPage.css for consistent styling
- Removed duplicate styles across components

#### **Navbar Updates**
- Added links for Badges (`/badges`)
- Added links for Audio Rooms (`/rooms`)
- Added links for Video Rooms (`/videorooms`)

#### **Mobile Responsive**
- Added responsive styles for profile tabs on mobile
- Smaller padding and font sizes for better mobile experience
- Flex-wrap support for tab overflow

### 🐛 Bug Fixes

- Fixed feed header layout with proper flex display
- Fixed comment wall header alignment
- Improved wall post detection logic (checks for non-reply, single p-tag)
- Better error handling in relay connection logic

## [Unreleased] - 2026-02-05

### 🚀 New Features

#### **Recipes Page**
- New `/recipes` page displaying community recipes from Nostr
- Fetches Kind 30040 (specialized recipes), Kind 30023 (Zap.cooking long-form), and Kind 35000 (gated content)
- Supports markdown template parsing for Zap.cooking recipe format
- Grid layout with recipe cards showing title, author, and preview

#### **Profile Page Tabs**
- Added dynamic content tabs to profile pages: Photos, Videos, Recipes, Livestreams, Blog
- Tabs only appear when user has content of that type
- Lazy loading for each tab to improve performance
- Recipes tab fetches user's Zap.cooking entries

#### **All Friends Page Redesign**
- Reduced page size from 100 → 24 profiles per page for 4x faster loading
- Added skeleton loading placeholders with shimmer animation
- Implemented CSS Grid layout for consistent, responsive card sizing
- Added styled friend cards with hover effects (lift + shadow)
- Improved pagination controls with gradient buttons
- Mobile-responsive design (3-column grid on smaller screens)
- Consistent MySpace-themed styling

#### **Profile Videos Tab Fix**
- Added `imeta` tag parsing for video detection (used by Primal, Damus, etc.)
- Fixed video URL regex to match URLs with query parameters (e.g., `video.mp4?token=xxx`)
- Videos from Kind 1 posts now properly detected via both imeta tags and content regex

### 🐛 Bug Fixes

- **Quote Post Box**: Fixed sizing issues - quote form now takes full width with proper text area dimensions
- **Threaded Comments**: Fixed text size inconsistency - comments now match main post styling (9pt, line-height 1.4)
- **Profile Videos Pagination**: Fixed infinite loop bug where `until` timestamp wasn't updated for batches without videos

---

## [Previous] - 2026-02-05

### 🚀 Major Features

#### **Blossom Integration for Comments**
- **Authenticated Image Uploads**:
  - Integrated **Blossom** media protocol into both `CommentWall` and `FeedItem` components.
  - Added "Add Photo" text links (replacing icons) for a cleaner, retro-inspired UI.
  - Automated URL injection: Uploaded image links are automatically appended to comment/reply text.
- **Improved UX**:
  - Implemented `Cmd + Enter` (Mac) and `Ctrl + Enter` (Windows/Linux) keyboard shortcuts for direct post submission.
  - Removed intrusive "Comment posted" alert notifications for a more seamless experience.

#### **Nested Threaded Conversations**
- **In-Feed Threading**:
  - Extended the recursively threaded reply structure from the thread page into individual homepage feed items.
  - Implemented visual hierarchy with progressive indentation (20px per level) and blue left-border connectors for deep conversations.
  - Added toggleable "Show thread" / "Collapse thread" functionality.
  - Added "View full thread" links next to expanded threads for dedicated page navigation.

### ⚡ Performance Improvements

#### **Wait-to-Render Threading**
- Refactored `FeedItem` to use a dedicated sub-component for threaded comments.
- **Lazy Tree Calculation**: Thread trees are now only calculated using `useMemo` when a user specifically clicks "Show thread," eliminating homepage mount lag.

#### **Network & UI Optimization**
- **Notification Efficiency**: Removed aggressive profile pre-fetching in the notification subscription loop; profiles now lazy-load via the `useProfile` hook only when viewed.
- **Scroll Smoothness**: Added 150ms debounce to the Intersection Observer logic in `HomePage.tsx` to prevent scroll-blocking state updates.
- **Media Processing Fast-Path**: 
  - Optimized `processMediaEvent` regex logic with early returns for short content.
  - Added direct tag parsing for Kind 1063 events to bypass expensive regex matches.

#### **Virtual Scrolling Implementation**
- **Homepage Feed Tab**:
  - Implemented virtual scrolling to fix severe performance issues caused by rendering all feed items at once.
  - Only renders 20 posts initially instead of 100+.
  - Added Intersection Observer for automatic progressive loading as user scrolls.
  - Loads 20 more items at a time when scrolling near bottom.
  - Reduced initial DOM nodes from ~100+ to 20, dramatically improving page load speed.
  - Added visual indicator showing "Showing X of Y posts" during progressive loading.

- **Live Streams Tab**:
  - Implemented virtual scrolling for stream listings to prevent loading all streams at once.
  - Only renders 15 streams initially.
  - Automatically loads 15 more as user scrolls.
  - Added Intersection Observer for smooth infinite scroll experience.
  - Displays count indicator: "Showing X of Y streams".

#### **Optimized Event Handling**
- Batched feed updates every 300ms to prevent excessive re-renders.
- Implemented event buffering with flush timeouts for smoother UI updates.
- Increased initial subscription limit from 15 to 25 to match display count.

### 🎨 UI/UX Enhancements

#### **Repost Identity**
- Replaced the generic 🔄 (Kind 6) icon with a tiny (16px) **Avatar of the reposter**.
- Makes it immediately clear "who" is sharing content at a glance without cluttering the feed.

#### **Modern Tab Design** (`HomePage.css`)
- Completely redesigned view mode tabs (Feed, Media, Blog, Music, Live) with modern aesthetics:
  - Added rounded top corners (8px border-radius).
  - Implemented gradient backgrounds for inactive tabs (`linear-gradient`).
  - Added smooth hover animations with lift effect (`transform: translateY(-2px)`).
  - Enhanced active state with prominent shadow (`box-shadow: 0 -4px 8px`).
  - Improved spacing with gap between tabs.
  - Increased padding for better touch targets (8px 20px).
  - Added smooth transitions (0.2s ease) for all interactive states.

#### **Stream Listings Redesign**
- Created new card-style design for stream items with orange accent borders and refined typography.
- Created new `.stream-item` CSS class with card-style design:
  - Added border with orange left accent (3px solid).
  - Implemented hover effects (blue border + shadow).
  - Improved spacing and padding (12px).
  - Better typography (10pt bold links).
  - Smooth transitions on hover (0.2s ease).
  - Consistent with MySpace aesthetic while feeling modern.

#### **Thread View Improvements** (`ThreadPage.tsx`)
- Completely redesigned thread view with proper nested conversation structure:
  - Implemented tree-based reply hierarchy where replies are indented under their parent comments.
  - Replies to a specific comment now appear directly beneath that comment with visual indentation.
  - Added blue left border (2px solid #6699cc) for nested replies to show conversation depth.
  - Progressive indentation (30px per level) for multi-level conversations.
  - Removed redundant "Show thread" buttons when already in thread view.
  - Added `hideThreadButton` prop to FeedItem component for context-aware UI.
  - Follows NIP-10 conventions for reply detection (reply marker or last e-tag).
  - Maintains feed-like styling for consistency across the application.

### 🛠 Technical Implementation

- **State Management**:
  - Added `displayedFeedCount` state for controlling rendered feed items.
  - Added `displayedStreamsCount` state for controlling rendered stream items.
  - Implemented refs for Intersection Observer triggers (`loadMoreTriggerRef`, `loadMoreStreamsTriggerRef`).

- **Intersection Observer Pattern**:
  - Configured with `threshold: 0.1` and `rootMargin: '100px'` for optimal trigger timing.
  - Proper cleanup on component unmount to prevent memory leaks.
  - Separate observers for feed and streams tabs.

- **Progressive Loading Strategy**:
  - Shows cached/fetched items from memory first (instant).
  - Only fetches from network when all local items are displayed.
  - Maintains feed cap at 100 items max for memory efficiency.

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
  - Complete rewrite to support the new multi-page structure.
  - Adaptive state for logged-in vs public views.
  - Fixed layout shifts and integration issues on the Homepage.
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

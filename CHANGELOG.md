# Changelog

All notable changes to the MyNostrSpace project will be documented in this file.

## [Unreleased] - 2026-02-14

### 🐛 Bug Fixes

#### **JSON Sanitization for Event Parsing**

- Fixed "JSON Parse Error" issues when parsing embedded NDKEvent objects in `FeedItem.tsx` and `ChatMessage.tsx`.
- **Root Cause:** Some events contained invalid control characters (non-printable ASCII) that caused `JSON.parse()` to fail.
- **Solution:** Added sanitization step that removes invalid control characters while preserving newlines and tabs.
- **Files modified:** `FeedItem.tsx`, `ChatMessage.tsx`

#### **NIP-46 Login Relay Handling**

- Fixed issue where extension-provided relays were not being properly added to NDK during NIP-46 login.
- **Solution:** Added explicit relay URL extraction and addition from extension's `getRelays()` response.
- **Files modified:** `NostrContext.tsx`

### ⚡ Performance Optimizations

#### **Thread Reply Buffering**

- Refactored thread reply loading to use buffered batch updates.
- **Problem:** Large threads with many replies were causing UI freezing due to excessive re-renders on each incoming event.
- **Solution:** Implemented a 400ms batching interval that collects incoming replies and updates the UI in batches, with a 50ms initial render delay.
- **Files modified:** `ThreadPage.tsx`

### 🎨 UI/UX Enhancements

#### **Avatar Component Improvements**

- Enhanced `Avatar` component with memoized color generation for deterministic fallback colors.
- Added native browser `loading="lazy"` attribute for profile images.
- Created SVG-based identicon fallback with initials (first 2 hex characters of pubkey) when no image is available.
- **Files modified:** `Avatar.tsx`

#### **RichTextRenderer Enhancements**

- Added `BLOCKED_KEYWORDS` filtering to automatically hide content containing inappropriate keywords.
- Improved lazy loading for embedded media with IntersectionObserver and Safari-compatible fallbacks.
- Enhanced YouTube embed handling with timeout fallback for reliable loading.
- Added `decoding="async"` for non-blocking image decoding.
- **Files modified:** `RichTextRenderer.tsx`

#### **Loading Screen Styling**

- Added retro MySpace-themed loading screen styles using design tokens.
- Implemented CSS-only loading spinner animation.
- **Files modified:** `index.css`

### 🛠 Technical Improvements

#### **App Routing Cleanup**

- Simplified and cleaned up route definitions in `App.tsx` for better maintainability.
- **Files modified:** `App.tsx`

## [Unreleased] - 2026-02-12

### 🚀 New Features

#### **Meta-Injection Server (Production Hardened)**

- Replaced Nginx with a custom **Node.js Express** server to handle dynamic meta-tag injection.
- **Bot Detection:** Implemented automated identification of search engine and social media crawlers (X/Twitter, Discord, Google, etc.).
- **Dynamic Meta Tags:** Bots are now served a modified `index.html` with injected `og:title`, `og:image`, and `twitter:card` tags for rich social previews.
- **Relay-Pool Fetching:** Switched from unreliable HTTP APIs to a WebSocket-based **SimplePool** that "races" multiple relays (`nos.lol`, `relay.primal.net`, `relay.damus.io`, etc.) for real-time metadata recovery.
- **Production Hardening:**
  - **In-Memory Caching:** `index.html` is cached in RAM for ultra-fast responses.
  - **Execution Timeouts:** Added 3s/1.5s hard timeouts to prevent bot requests from hanging the server.
  - **DNS Fix:** Updated `docker-compose.yml` with explicit Cloudflare/Google DNS resolvers to fix container-level networking issues.
  - **SEO:** Added `robots.txt` to explicitly allow crawling of profile and thread routes.
- **Files modified:** `server.js`, `Dockerfile`, `docker-compose.yml`, `package.json`, `robots.txt`


### 🚀 New Features

#### **Replies Feed**

- Added a new **Replies** tab to the homepage.
- **Visual Threading:** Redesigned the Replies tab UI with vertical connectors and structured indentation (similar to the main thread view) to clarify conversational relationships.
- **Infinite Scrolling:** Implemented `loadMoreReplies` for seamless back-filling of historical replies.
- **Contextual Rendering:** Replies now display their parent note (Kind 1) using an embedded preview for better conversational context.
- **Recursive Improvements:** Removed redundant "↳ Replied:" text in favor of stronger CSS-based visual markers.
- **Files modified:** `HomePage.tsx`, `HomePage.css`, `EmbeddedNote.tsx`

### ⚡ Performance Optimizations

#### **Blog Feed Performance**

- Optimized the rendering of long-form articles (Kind 30023) within the main feed.
- **Problem:** Full markdown rendering of massive blog posts was causing significant UI lag and "jank" in the main feed.
- **Solution:** Implemented specialized rendering for blog posts in `FeedItem.tsx` that shows a title, a short content summary, and a "Read Full Article" button.
- **Files modified:** `FeedItem.tsx`

### 🚀 New Features

#### **User Tagging / Mention Feature**

- Implemented `@` mentions in comments, replies, **status updates**, and **quote posts**.
- **Usage:** Type `@` to see a list of friends/follows.
- **Integration:** Now available in:
  - Feed Comments & Replies
  - Home Page Status Update
  - Quote Reply Box
- **Global Search:** Type a name (e.g., `@zap`) to search the entire Nostr network (NIP-50) if the user is not in your friend list.
- **Optimization:** Uses incremental profile loading to ensure suggestions appear quickly without freezing the UI.
- **Notifications:** Automatically tags mentioned users so they receive notifications.
- **Files modified:** `MentionInput.tsx`, `FeedItem.tsx`, `MentionInput.css`, `mentions.ts`

### 🎨 UI/UX Enhancements

#### **Mobile Thread View Improvements**

- Optimized threaded reply indentation for mobile devices.
- **Problem:** Deeply nested threads were accumulating too much left margin on small screens, causing text to be "crammed" to the edge.
- **Solution:** Added a media query for screens under 768px to reduce indentation from 20px to 8px and padding from 10px to 5px.
- **Files modified:** `ThreadPage.tsx`

#### **Notification Cleanup**

- Removed "Followed You" notifications from the Notification tab.
- **Problem:** Follower notifications were not working reliably and added unnecessary clutter/complexity.
- **Solution:** Completely removed the logic for fetching Kind 3 (Contact) events and rendering "followed you" alerts. Will revisit at a later time.
- **Files modified:** `HomePage.tsx`

## [Unreleased] - 2026-02-11

### 🐛 Bug Fixes

#### **Thread View Theming**

- Fixed issue where thread view lost custom theming on page refresh.
- **Root Cause:** Custom layout CSS was being injected before default component styles, causing defaults to take precedence. Also, specific feed items were missing styles available on other pages.
- **Solution:**
  - Moved custom CSS injection to the end of `ThreadPage.tsx` to ensure proper cascading.
  - Extracted shared feed styles from `ProfilePage.css` into a modular `FeedItem.css`.
  - Standardized button and form styles across `FeedItem` and `InteractionBar` using global design tokens.
- **Files modified:** `ThreadPage.tsx`, `ProfilePage.css`, `FeedItem.css`, `FeedItem.tsx`, `InteractionBar.tsx`

#### **NIP-45 Stats & Homepage Stability**

- Refactored event interaction counts (Likes, Comments, Reposts, Zaps) to use reliable **NIP-45 COUNT** queries.
- **Improved Stability**: Implemented a global concurrency limiter (`MAX_CONCURRENT_STATS = 3`) to prevent "subscription storms" that were freezing the homepage.
- **Optimized Performance**:
  - Added a 500ms batch collection window for stats requests.
  - Limits batch processing to 10 events at a time.
  - Direct `relay.count` support for relays that natively support NIP-45.
- **Reliable Fallback**: Added a throttled manual counting mechanism for relays without NIP-45 support.
- **Files modified:** `statsCache.ts`

### 🎨 UI/UX Enhancements

#### **Quote Box & Button Styling**

- Standardized the look of the quote box and action buttons in the feed.
- Quote box now takes full width for better usability.
- Buttons now use consistent MySpace-themed styling (blue/white) instead of browser defaults or inline styles.

#### **Dynamic Block List & Notification Reliability**

- **Kind 10000 (Mute List) Support**: Integrated support for fetching and updating user mute lists from Nostr.
- **Improved Blocking**: Added `useBlockList` hook to centralize blocking logic, ensuring blocked users are filtered from:
  - Global follower counts and statistics.
  - Profile friends and follower lists.
  - Real-time notifications (all kinds).
- **Follow Notification Fix**: Implemented session-aware filtering for Kind 3 events.
  - Prevents "notification floods" on startup by verifying only new follow events during the active session.
  - Uses reliable history fetching via Antiprimal relays to verify follow state changes.
- **Functional "Block User" Action**: Completed the "Block User" UI in `ContactBox`, allowing users to dynamically mute accounts via Nostr.
- **Files modified**: `HomePage.tsx`, `useFriends.ts`, `ContactBox.tsx`, `useBlockList.ts`, `blockedUsers.ts`

### 🚀 New Features

#### **Bitari 2100 Arcade Integration**

- Added **Bitari 2100 Arcade** to the Games section, consolidating multiple Bitari games (Hash-out, Pow-man, Dip Hopper) into a single retro-themed hub.
- Games are embedded via iframes for a seamless in-app experience.
- Updated `GAMES_LIST` to include the new consolidated Bitari entry.

### 🛠 Technical Improvements

#### **Game Data Refactoring**

- Extracted `Game` interface and `GAMES_LIST` constant from `GamesPage.tsx` into a dedicated `gamesData.ts` file.
- **Fixed Lint Error:** Resolved a "Fast Refresh" error in `GamesPage.tsx` caused by exporting constants alongside components.
- Standardized game data structure across the application.
- **Files modified:** `GamesPage.tsx`, `GamePlayerPage.tsx`, `gamesData.ts`

## [Unreleased] - 2026-02-10

### 🚀 New Features

#### **Browse Page Update**

- **Categories Update**:
  - Renamed "**Audio Rooms**" to "**Rooms**" to better reflect content diversity.
  - Added "**Games**" category pointing to `/games`.

### ⚡ Performance Optimizations

### ⚡ Performance Optimizations

#### **Homepage Stats Batching (NIP-01)**
- Refactored `statsCache.ts` to implement batched event fetching for likes and comments.
- **Problem**: Homepage was making 80+ separate subscription requests to fetch interaction stats for every visible post.
- **Solution**: Implemented a batching mechanism that groups visible events and fetches all their stats in a single NIP-01 subscription request.
- **Result**: Network request overhead reduced by ~95%, significantly improving homepage load performance and reducing relay load.
- **Files modified**: `statsCache.ts`

### 🐛 Bug Fixes
- **Feed Update Logic**: Incoming posts are now queued and displayed via a "click to show" banner instead of automatically shifting the feed, preventing scroll jumps.
- **NIP-10 Compliance**: Refined reply tag generation in `FeedItem.tsx` to strictly adhere to standards, removing redundant `root` and `reply` tags for direct replies.

### 🎨 UI/UX Enhancements
- **Expandable Status Input**: The home status update box now auto-resizes as you type to handle longer messages comfortably.
- **Tab Styling**: Refined homepage tabs with neutral gray backgrounds for inactive states, making the active tab clearly stand out.
- **New Posts Banner**: Updated coloring to be distinct from tab states to avoid visual confusion.

### 🗑️ Removed
- **Music Tab**: Removed the "Music" tab and Wavlake player from the homepage and sidebar for a cleaner, faster interface.

## [Unreleased] - 2026-02-08

### 🐛 Bug Fixes

#### **Message Caching & Read Status**

- Fixed issue where unread messages weren't being properly tracked after reading them
- **Root Cause:** Incoming DM events from network subscriptions were resetting read status to false, overwriting database state
- **Solution:** Modified `useMessages.ts` to preserve read status from database when processing duplicate events
- Now when you mark messages as read in a conversation, the "You've Got Mail!" notification properly decreases
- **Files modified:** `useMessages.ts`

#### **Message Subscription on Homepage**

- Fixed "You've Got Mail!" notification not updating until user clicks Messages in navbar
- **Root Cause:** `useMessages` hook was only called in MessagesPage/ConversationPage, not HomePage
- **Solution:** Added `useMessages` call to HomePage to load messages in background automatically
- Messages now start syncing as soon as homepage loads, no navigation required
- **Files modified:** `HomePage.tsx`

#### **Message Sending Error**

- Fixed "undefined is not a constructor" error when sending messages
- **Root Cause:** Code was trying to access NDKEvent through `ndk.constructor.NDKEvent` which is unreliable
- **Solution:** Properly import NDKEvent from @nostr-dev-kit/ndk and use direct constructor
- **Files modified:** `ConversationPage.tsx`

#### **"You've Got Mail!" Styling**

- Simplified notification box styling to match My Apps/Alerts design
- Removed unnecessary gradients, shadows, and animations
- Now uses clean rose/mauve header (#d97979) matching Alerts box
- Only the text "You've Got Mail!" is clickable, not entire box
- **Files modified:** `HomePage.tsx`, `HomePage.css`

### 🚀 New Features

#### **NIP-04 Direct Messaging System**

Complete implementation of Nostr direct messaging (DMs) using NIP-04 legacy encryption with Dexie local caching:

**Core Features:**

- ✅ Full two-way messaging: send and receive encrypted DMs
- ✅ Real-time message subscriptions (kind 4 events)
- ✅ Message encryption/decryption with NDK signer (supports all extensions: Alby, nos2x, Nos, NIP-46 signers)
- ✅ Local Dexie database for persistent message storage and offline access
- ✅ Conversation grouping with unread counts and last message previews
- ✅ Auto-scroll to bottom on new messages
- ✅ Responsive UI with design tokens (mobile & desktop)
- ✅ NIP-04 privacy notice explaining encryption limitations

**Pages & Components:**

- `MessagesPage.tsx` - Main inbox showing all conversations with unread counts
- `ConversationPage.tsx` - Individual message thread with single user
- `MessageItem.tsx` - Single message bubble (sent/received styling)
- `MessageComposer.tsx` - Text input with send functionality
- `NewConversationModal.tsx` - Modal to start new DM with pubkey validation
- Complete CSS styling for all components using design tokens

**Services & Hooks:**

- `messageCache.ts` - Dexie database service for message persistence (add, query, mark read, bulk operations)
- `useMessages.ts` - Hook to subscribe to kind 4 events and cache locally
- `useConversations.ts` - Hook to group messages by conversation partner
- `useDMRelays.ts` - Hook to fetch user's DM relay preferences (kind 10050)

**Architecture Decisions:**

- Chose NIP-04 over NIP-17 for immediate compatibility with current Nostr ecosystem
- NIP-17 infrastructure preserved for future upgrade when signers support NIP-44 encryption
- Message batching (300ms) to prevent excessive re-renders during sync
- Subscription-based loading with NDK cache-first strategy

**Routes:**

- `/messages` - Inbox with conversation list
- `/messages/:pubkey` - Individual conversation thread

#### **"You've Got Mail!" Homepage Section**

- Added oldschool MySpace-themed mailbox notification above "My Apps"
- Displays unread message count with eye-catching retro styling (orange gradient, yellow/cream background)
- Shows mailbox emoji (📬) with bold count display
- Conditional rendering (only shows when unread > 0)
- Clickable section navigates to `/messages` inbox
- Real-time updates every 5 seconds via Dexie database
- Smooth hover animations with lift effect and text shadow
- **Files modified:** `HomePage.tsx`, `HomePage.css`

**"Mark All as Read" Button:**

- Added to Messages page header to clear all unread counts at once
- Only displays when totalUnread > 0
- Updates both message read status and conversation metadata
- Page reload ensures UI reflects changes across all conversations

### ⚡ Performance Optimizations

#### **Media Lazy Loading with IntersectionObserver**

- Created `LazyImage` component in `RichTextRenderer.tsx` with IntersectionObserver (50px rootMargin)
  - Only loads images when they enter viewport
  - Prevents off-screen image loading, reducing initial network requests
- Created `LazyVideo` component in `RichTextRenderer.tsx` with IntersectionObserver (100px rootMargin)
  - Defers video loading until visible
  - Sets `preload="none"` for off-screen videos
- Enhanced `VideoThumbnail.tsx` with IntersectionObserver
  - Only generates thumbnails for visible videos
  - Reduces memory and CPU usage during gallery scrolling
- Added `decoding="async"` to all images for non-blocking decode
- Added `loading="lazy"` to all iframes (YouTube, Vimeo, Streamable)

#### **Cross-Page Component Memoization**

- `VideosPage.tsx`: Wrapped VideoCard component with `React.memo` to prevent re-renders
- `PhotosPage.tsx`: Wrapped PhotoCard component with `React.memo` for smoother gallery scrolling
- `ThreadPage.tsx`: Wrapped ThreadItemRow component with `React.memo` for thread interactions
- Memoized `InternalMention` component in `RichTextRenderer.tsx` to prevent unnecessary profile fetches

#### **Deferred Profile Fetching**

- Implemented `requestIdleCallback` with `setTimeout` fallback for non-blocking profile loads
- VideosPage, PhotosPage, and ThreadPage now fetch author profiles during browser idle time
- Prevents blocking of main thread and user interactions

#### **Build Error Fix**

- Removed unused `memo` import from `ProfilePage.tsx` that was causing TypeScript compilation failure

### 📊 Expected Performance Impact

- ✅ Reduced initial network requests by ~50% (off-screen images/videos not loaded)
- ✅ Smoother scrolling in media-heavy pages (gallery pages, feed with videos)
- ✅ Faster page interactivity (deferred non-critical profile fetching)
- ✅ Better memory usage (lazy loading + memoization prevents unnecessary DOM nodes)
- ✅ Improved Core Web Vitals (LCP, CLS, FID)

---

## [Unreleased] - 2026-02-07

### 🚀 New Features

#### **Site-wide Blocked Users & Keywords**

- Centralized `isBlockedUser` and `hasBlockedKeyword` utilities integrated into **Browse**, **Videos**, **Photos**, **Thread View**, and **Profile** pages.
- Added site-wide filtering for `BLOCKED_KEYWORDS`.
- Content from blocked pubkeys or containing blocked keywords is automatically hidden from feeds, grids, and replies.
- Blocked profiles display a "Profile Blocked" notification.

#### **Badge Awarding (NIP-58)**

- Added **AwardBadgeModal** for badge creators to award their badges to others.
- Integrated "Give Badge" option into user profiles for badge creators.
- Added direct "Award" button to owned badges on the **Badges** page.

### 🎨 UI/UX Enhancements

#### **Mobile Comment Header Layout**

- Comment headers now stack name and date vertically on mobile to prevent cramped text.
- Added `.comment-header`, `.comment-author-name`, and `.comment-date` CSS classes for threaded comments.
- Date/time displays on its own line below the author name on screens under 768px.
- Feed header line also stacks vertically on mobile for consistency.

#### **Notifications Tab & Entity Loading Fixes**

- Fixed an issue where manual text truncation in notification items broke the parsing of `nostr:nevent` and `nostr:npub` links.
- Switched to CSS-based `line-clamp` for visual truncation in the notifications tab to ensure raw content remains intact for the renderer.
- Resolved "Invalid filter(s) detected" error by adding validation for `"undefined"` IDs in event fetch calls across `HomePage.tsx`, `EmbeddedNote.tsx`, and `RichTextRenderer.tsx`.
- Improved mobile text wrapping in the notifications tab with `overflow-wrap: break-word` and `word-break: break-word`.
- Added extra validation in `RichTextRenderer` to ensure pubkeys and IDs are valid before rendering.

#### **Marketplace Mobile Optimization**

- Improved marketplace popup placement on mobile devices to prevent scrolling.
- Ensured all popup content (images, descriptions, links) fits within the mobile viewport.

---

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

#### **Zap Parsing Fixes**

- Fixed issue where zaps appeared as 0 sats locally.
- Implemented dual-parsing for zap receipts and zap requests to ensure accurate amounts.
- Ensured zap requests are published to relays for synchronization with external platforms like Zap.stream.

#### **Wall Comment UI**

- Enhanced comment wall headers to show "Commenter → Wall Owner".
- Improved visual clarity of wall post relationships across the site.

#### **Profile Video Detection**

- Added `imeta` tag parsing and Kind 1 mp4 detection to profile Video tab.
- Unified video parsing logic between HomePage and ProfileVideos for consistency.

### ⚡ Performance

#### **Homepage Feed Optimization**

- Added shared profile cache with request deduplication (`profileCache.ts`)
  - Previously: 40+ parallel profile fetches per page load
  - Now: Deduplicated requests, cached results shared across components
- Extracted feed deduplication/sort into reusable helper function
- Added batched stats fetching for InteractionBar (`statsCache.ts`)
  - Previously: 35 separate `fetchEvents()` calls for visible items
  - Now: Single batched query with 150ms collection window
- Memoized `RichTextRenderer` with `React.memo()` to prevent unnecessary re-renders

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

# 🪶 mynostrspace.com

### _a place for friends... on the protocol_

![Mynostrspace Logo](https://i.nostr.build/hT1vHIIQIB10OGFS.jpg)

Welcome to **mynostrspace.com**, the ultimate fusion of 2005 social media nostalgia and the 2025 sovereign web. We've brought back the "golden age" of profile customization and social discovery, powered entirely by the **Nostr** protocol.

---

## ⚡️ Features

### Nostr Protocol Support
NIP-01 notes/posts, NIP-02 follow lists, NIP-07 browser extension login, NIP-46 Bunker/remote signer, NIP-10 threaded replies, NIP-23 long-form articles, NIP-25 reactions/likes, NIP-57 zaps, NIP-58 badges (display + awarding), NIP-65 relay lists, NIP-89 client tags, NIP-94 file metadata, NIP-98 authenticated uploads, reposts, zap receipts, profile badges, recipes, custom profile CSS, livestreams, music tracks, relay management, wall posts, quote posts, media uploads via Blossom, nostr: URI rendering

### MySpace-Style Features
- **🎨 Custom Profile Themes**: Full CSS editor with presets (Classic MySpace, Matrix, Y2K Glitter, Emo/Scene, GeoCities, Cyberpunk)
- **🖼️ Profile Background Uploads**: Upload custom backgrounds via Blossom
- **😊 Mood Selector**: Set your mood with every status update
- **💬 Comment Walls**: Leave notes for friends, signed with Nostr keys
- **👥 Friend Lists**: View and manage your follows MySpace-style
- **🎵 Music Player**: Integrated Wavlake player with retro skin
- **📊 Profile Stats**: Followers, posts, and zaps received
- **🏆 Profile Badges**: Display your NIP-58 badges on your profile
- **📑 Tabbed Interface**: Feed, Media, Blog, Music, Live, Notifications

### Pages & Content
- **Home Feed**: Virtual-scrolled timeline with mood posting
- **Profile**: Customizable profiles with Photos, Videos, Recipes, Livestreams, Blog tabs
- **Browse/Discover**: Category grid with people discovery
- **Search**: Find people and notes across relays
- **Thread View**: Nested threaded conversations
- **Photos & Videos**: Masonry gallery with lazy loading
- **Music**: Wavlake integration for Nostr music
- **Blogs**: Long-form article reading and writing
- **Recipes**: Community recipes from Zap.cooking
- **Marketplace**: Product listings (Kind 30017/30018)
- **Calendar**: Visualize posts by date
- **Livestreams**: HLS streaming with live chat
- **Film**: Movie content discovery
- **Badges**: View and award NIP-58 badges
- **Audio/Video Rooms**: Corny Chat and Nostr Nests integration
- **Settings**: Relay management and profile editing

### Performance
- **Virtual Scrolling**: Only renders visible items
- **Infinite Scroll**: Intersection Observer-based loading
- **Profile Caching**: Deduplicated requests with shared cache
- **Batched Stats**: Single query for interaction counts
- **Code Splitting**: Route-based lazy loading
- **Skeleton Loaders**: Smooth loading states

---

## 🏗️ Tech Stack

- **React 19 + TypeScript**: Built with the latest and greatest for maximum stability.
- **Vite**: Ultra-fast development and build pipeline.
- **NDK (Nostr Dev Kit)**: Robust interaction with the Nostr decentralized network.
- **Docker**: Ready to deploy anywhere in seconds.
- **Nginx**: Hardened and configured for single-page application routing.

---

## 🚀 Getting Started

### 🐳 Docker (The Quick Start)

The easiest way to get mynostrspace running is with Docker:

```bash
docker-compose up --build -d
```

Your app will be live at `http://localhost:6767`.

### 🛠️ Local Development

1. **Install Dependencies**:

   ```bash
   npm install
   ```

   _(Note: We use `legacy-peer-deps=true` via `.npmrc` to handle React 19 compatibility across the ecosystem.)_

2. **Run Dev Server**:

   ```bash
   npm run dev
   ```

3. **Build for Production**:
   ```bash
   npm run build
   ```

---

## 🐳 Infrastructure & Deployment

The project is pre-configured with a multi-stage **Dockerfile** and customized **nginx.conf** to handle:

- Client-side routing fallbacks.
- Tiny final image sizes.
- Hardened Content Security Policy (CSP).
- Custom internal port 6767 for specialized deployments.

---

## 🤝 Contributing

This is a place for friends! If you want to add a new retro theme, fix a bug, or implement a new Nostr NIP, feel free to open a PR.

**Stay Sovereign. Stay Retro.** ✌️🪶

# 🪶 mynostrspace.com

### _a place for friends... on the protocol_

![Mynostrspace Logo](https://i.nostr.build/hT1vHIIQIB10OGFS.jpg)

Welcome to **mynostrspace.com**, the ultimate fusion of 2005 social media nostalgia and the 2025 sovereign web. We've brought back the "golden age" of profile customization and social discovery, powered entirely by the **Nostr** protocol.

---

## ⚡️ Features

- **🎨 Total Profile Freedom**: Use the built-in **Layout Editor** to inject custom CSS directly into your profile. Go Emo, Go Cyberpunk, or Go Geocities—it's your space.
- **🔝 The Legendary Top 8**: Hand-pick your closest allies and display them proudly on your profile.
- **🎵 Music Player**: Integrated with **Wavlake** to bring your favorite tracks to your page. Retro player skin? Included.
- **🖼️ Photo Lightbox**: High-performance image viewing with a simple click.
- **💬 Comment Wall**: Leave notes for your friends, just like the old days, but signed with your Nostr keys.
- **🌩️ Blossom Support**: Seamlessly upload background images and media using the Blossom media protocol.
- **📱 Mobile Optimized**: A responsive experience that feels native on your phone while keeping that desktop-retro vibe.

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

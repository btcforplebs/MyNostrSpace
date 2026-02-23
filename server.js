import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nip19, SimplePool } from 'nostr-tools';
import WebSocket from 'ws';

// Polyfill WebSocket for Node environment
if (typeof global.WebSocket === 'undefined') {
    global.WebSocket = WebSocket;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 6767;

const DIST_PATH = path.join(__dirname, 'dist');
const INDEX_HTML_PATH = path.join(DIST_PATH, 'index.html');

// Cache the index.html in memory for performance
let cachedIndexHtml = '';
try {
    cachedIndexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
} catch (e) {
    console.error('CRITICAL: dist/index.html not found. Please build the project.');
}

// Robust relay pool
const RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://purplepag.es'
];

const pool = new SimplePool();
const botRegex = /bot|google|baidu|bing|msn|duckduckbot|teoma|slurp|yandex|twitterbot|facebookexternalhit|roblox|discordapp/i;

// Local hex helper (using Buffer for reliability)
const toHex = (bytes) => Buffer.from(bytes).toString('hex');

async function fetchWithTimeout(promise, ms) {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Fetch Timeout')), ms)
    );
    return Promise.race([promise, timeout]);
}

async function fetchNostrData(type, id) {
    let hex = id;
    let relayHint = null;

    // Handle all Nostr Bech32 identifiers
    if (id.startsWith('npub') || id.startsWith('note') || id.startsWith('naddr') || id.startsWith('nevent') || id.startsWith('nprofile')) {
        try {
            const decoded = nip19.decode(id);
            if (decoded.type === 'naddr') {
                // For sharded notes (community/channel posts)
                hex = decoded.data.id;
                relayHint = decoded.data.relay;
            } else if (decoded.type === 'nevent') {
                // Event with relay hints
                hex = decoded.data.id;
                relayHint = decoded.data.relay;
            } else if (decoded.type === 'nprofile') {
                // Profile with relay hints
                hex = decoded.data.pubkey;
                relayHint = decoded.data.relay;
            } else {
                hex = typeof decoded.data === 'string' ? decoded.data : toHex(decoded.data);
            }
        } catch (e) {
            console.error(`[Fetch] Invalid Bech32 ID: ${id}`);
            return null;
        }
    }

    try {
        console.log(`[Fetch] Searching for ${type}: ${hex} across pool...`);

        let filter;
        if (type === 'profile') {
            filter = { kinds: [0], authors: [hex], limit: 1 };
        } else {
            filter = { ids: [hex], limit: 1 };
        }

        // 5-second hard timeout for the relay fetch
        // For sharded notes, prioritize the relay hint if available
        let relaysToQuery = RELAYS;
        if (relayHint) {
            console.log(`[Fetch] Using relay hint: ${relayHint}`);
            relaysToQuery = [relayHint, ...RELAYS];
        }
        const event = await fetchWithTimeout(pool.get(relaysToQuery, filter), 5000);
        if (!event) {
            console.log(`[Fetch] No event found for ${hex}`);
            return null;
        }

        if (type === 'profile') {
            const metadata = JSON.parse(event.content || '{}');
            const author = metadata.display_name || metadata.name || 'Nostr User';
            return {
                title: `MyNostrSpace - ${author}`,
                description: (metadata.about || 'Nostr Profile').slice(0, 160),
                image: metadata.picture || '/mynostrspace_logo.png'
            };
        } else {
            // Fetch author profile separately
            const authorHex = event.pubkey;
            console.log(`[Fetch] Searching for author profile: ${authorHex}...`);
            const profileEvent = await fetchWithTimeout(pool.get(RELAYS, { kinds: [0], authors: [authorHex], limit: 1 }), 5000).catch((err) => {
                console.warn(`[Fetch Warn] Profile fetch failed for ${authorHex}: ${err.message}`);
                return null;
            });

            const profile = profileEvent ? JSON.parse(profileEvent.content || '{}') : {};
            const author = profile.display_name || profile.name || 'Nostr User';
            const snippet = (event.content?.slice(0, 80) || 'Nostr Thread').replace(/\n/g, ' ') + '...';

            return {
                title: `MyNostrSpace - ${author} - ${snippet}`,
                description: `Post by ${author} on MyNostrSpace`,
                image: profile.picture || '/mynostrspace_logo.png'
            };
        }
    } catch (e) {
        console.error(`[Fetch Error] ${type} ${id}:`, e.message);
        return null;
    }
}

// Static assets
app.use('/assets', express.static(path.join(DIST_PATH, 'assets'), { maxAge: '1y' }));
app.use(express.static(DIST_PATH, { index: false }));

// Main Handler
app.use(async (req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    const isBot = botRegex.test(userAgent);

    if (!cachedIndexHtml) {
        return res.status(500).send('Production build missing.');
    }

    const profileMatch = req.path.match(/^\/p\/([a-zA-Z0-9]+)/);
    const threadMatch = req.path.match(/^\/thread\/([a-zA-Z0-9]+)/);

    if (isBot && (profileMatch || threadMatch)) {
        console.log(`[Bot Request] ${req.path} (${userAgent})`);
        const type = profileMatch ? 'profile' : 'thread';
        const id = profileMatch ? profileMatch[1] : threadMatch[1];
        const meta = await fetchNostrData(type, id);

        if (meta) {
            let html = cachedIndexHtml;
            console.log(`[Injecting] ${meta.title}`);
            html = html.replace(/<title>.*?<\/title>/, `<title>${meta.title}</title>`);
            const tags = [
                { name: 'description', content: meta.description },
                { property: 'og:title', content: meta.title },
                { property: 'og:description', content: meta.description },
                { property: 'og:image', content: meta.image },
                { name: 'twitter:card', content: 'summary_large_image' },
                { name: 'twitter:title', content: meta.title },
                { name: 'twitter:description', content: meta.description },
                { name: 'twitter:image', content: meta.image }
            ];
            tags.forEach(t => {
                const attr = t.name ? `name="${t.name}"` : `property="${t.property}"`;
                const regex = new RegExp(`<meta ${attr} content=".*?" \\/>`, 'g');
                if (html.match(regex)) {
                    html = html.replace(regex, `<meta ${attr} content="${t.content}" />`);
                } else {
                    html = html.replace('</head>', `  <meta ${attr} content="${t.content}" />\n</head>`);
                }
            });
            return res.send(html);
        }
    }
    res.send(cachedIndexHtml);
});

// Final Polish: Graceful Shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing pool...');
    pool.close();
    process.exit(0);
});

app.listen(PORT, () => console.log(`Production server running on port ${PORT}`));

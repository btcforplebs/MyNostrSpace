'use strict';

const os = require('os');

function getIPv4() {
    const ifaces = os.networkInterfaces();
    for (const interfaceName in ifaces) {
        const iface = ifaces[interfaceName];
        for (const { address, family, internal } of iface) {
            if (family === 'IPv4' && !internal) {
                return address;
            }
        }
    }
    return '0.0.0.0';
}

// IMPORTANT: For production, set this to your public domain or IP
// const IPv4 = getIPv4(); // This only gets internal IP
const IPv4 = process.env.EXTERNAL_IP || getIPv4(); // Use env var or fallback to internal
const numWorkers = require('os').cpus().length;

module.exports = {
    console: {
        timeZone: 'UTC',
        debug: false,
        colors: true,
    },
    server: {
        listen: {
            ip: '0.0.0.0',
            port: process.env.PORT || 3010,
        },
        ssl: {
            cert: '../ssl/cert.pem',
            key: '../ssl/key.pem',
        },
        cors: {
            origin: '*', // Allow all origins for now, can restrict later
            methods: ['GET', 'POST'],
        },
        recording: {
            enabled: false,
            endpoint: '',
            dir: 'rec',
        },
        rtmp: {
            enabled: false,
        },
    },
    middleware: {
        IpWhitelist: {
            enabled: false,
            allowed: ['127.0.0.1', '::1'],
        },
    },
    api: {
        keySecret: 'mynostrspace_hivetalk_secret_changeme',
        allowed: {
            meetings: false,
            meeting: true,
            join: true,
            token: false,
            slack: false,
            mattermost: false,
        },
    },
    jwt: {
        key: 'mynostrspace_jwt_secret_changeme',
        exp: '1h',
    },
    oidc: {
        enabled: false,
    },
    host: {
        protected: false,
        user_auth: false,
        users_from_db: false,
        users: [],
    },
    presenters: {
        list: [],
        join_first: true,
    },
    integrations: {
        chatGPT: {
            enabled: false,
        },
        videoAI: {
            enabled: false,
        },
        email: {
            alert: false,
        },
        ngrok: {
            enabled: false,
        },
        sentry: {
            enabled: false,
        },
        mattermost: {
            enabled: false,
        },
        slack: {
            enabled: false,
        },
        discord: {
            enabled: false,
        },
        IPLookup: {
            enabled: false,
        },
        survey: {
            enabled: false,
        },
    },
    redirect: {
        enabled: false,
    },

    ui: {
        brand: {
            app: {
                name: 'MyNostrSpace Video',
                title: 'MyNostrSpace Video<br />Video Conferencing for Nostr',
                description: 'Join video calls directly from MyNostrSpace.',
            },
            site: {
                title: 'MyNostrSpace Video Rooms',
                icon: '../images/logo.svg',
                appleTouchIcon: '../images/logo.svg',
            },
            meta: {
                description: 'MyNostrSpace Video Rooms powered by WebRTC and Mediasoup.',
                keywords: 'webrtc, nostr, video, audio, conferencing',
            },
            html: {
                features: false,
                teams: false,
                tryEasier: false,
                poweredBy: false,
                sponsors: false,
                advertisers: false,
                footer: false,
            },
        },
        buttons: {
            main: {
                shareButton: true,
                hideMeButton: true,
                startAudioButton: true,
                startVideoButton: true,
                startScreenButton: true,
                swapCameraButton: true,
                chatButton: true,
                pollButton: false,
                editorButton: false,
                raiseHandButton: true,
                transcriptionButton: false,
                whiteboardButton: false,
                snapshotRoomButton: true,
                emojiRoomButton: true,
                settingsButton: true,
                aboutButton: false,
                exitButton: true,
            },
            settings: {
                fileSharing: true,
                lockRoomButton: true,
                unlockRoomButton: true,
                broadcastingButton: false,
                lobbyButton: true,
                sendEmailInvitation: false,
                micOptionsButton: true,
                tabRTMPStreamingBtn: false,
                tabModerator: true,
                tabRecording: false,
                host_only_recording: false,
                pushToTalk: true,
            },
        },
    },
    stats: {
        enabled: false,
    },
    mediasoup: {
        numWorkers: numWorkers,
        worker: {
            rtcMinPort: 40000,
            rtcMaxPort: 40100,
            disableLiburing: false,
            logLevel: 'error',
            logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
        },
        router: {
            audioLevelObserverEnabled: true,
            activeSpeakerObserverEnabled: false,
            mediaCodecs: [
                {
                    kind: 'audio',
                    mimeType: 'audio/opus',
                    clockRate: 48000,
                    channels: 2,
                },
                {
                    kind: 'video',
                    mimeType: 'video/VP8',
                    clockRate: 90000,
                    parameters: {
                        'x-google-start-bitrate': 1000,
                    },
                },
                {
                    kind: 'video',
                    mimeType: 'video/VP9',
                    clockRate: 90000,
                    parameters: {
                        'profile-id': 2,
                        'x-google-start-bitrate': 1000,
                    },
                },
                {
                    kind: 'video',
                    mimeType: 'video/h264',
                    clockRate: 90000,
                    parameters: {
                        'packetization-mode': 1,
                        'profile-level-id': '4d0032',
                        'level-asymmetry-allowed': 1,
                        'x-google-start-bitrate': 1000,
                    },
                },
            ],
        },
        webRtcServerActive: false,
        webRtcTransport: {
            listenInfos: [
                {
                    protocol: 'udp',
                    ip: '0.0.0.0',
                    announcedAddress: IPv4,
                    portRange: { min: 40000, max: 40100 },
                },
                {
                    protocol: 'tcp',
                    ip: '0.0.0.0',
                    announcedAddress: IPv4,
                    portRange: { min: 40000, max: 40100 },
                },
            ],
            initialAvailableOutgoingBitrate: 1000000,
            minimumAvailableOutgoingBitrate: 600000,
            maxSctpMessageSize: 262144,
            maxIncomingBitrate: 1500000,
        },
    },
};

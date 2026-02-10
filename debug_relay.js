import WebSocket from 'ws';

const relayUrl = 'wss://antiprimal.net';
const ws = new WebSocket(relayUrl);

ws.on('open', function open() {
    console.log('Connected to ' + relayUrl);
    // NIP-50 Search Request
    const req = JSON.stringify([
        "REQ",
        "test-search",
        {
            "kinds": [0],
            "search": "derek",
            "limit": 5
        }
    ]);
    console.log('Sending: ' + req);
    ws.send(req);
});

ws.on('message', function incoming(data) {
    console.log('Received: ' + data.toString());
});

ws.on('error', function error(err) {
    console.error('Error:', err);
});

ws.on('close', function close() {
    console.log('Disconnected');
});

setTimeout(() => {
    console.log('Timeout, closing...');
    ws.close();
}, 5000);

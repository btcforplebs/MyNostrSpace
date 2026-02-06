import { NDKUser, NDKEvent } from '@nostr-dev-kit/ndk';

const ALL_NESTS_API_BASE = 'https://nostrnests.com/api/v1/nests';

export interface CreateNestRequest {
    relays: string[];
    hls_stream?: boolean;
}

export interface CreateNestResponse {
    roomId: string;
    endpoints: string[];
    token: string;
}

export interface JoinNestResponse {
    token: string;
}

export interface NestInfo {
    host: string;
    speakers: string[];
    admins: string[];
    link: string;
    recording: boolean;
    server?: string;
}

export interface UpdatePermissionsRequest {
    participant: string;
    can_publish?: boolean;
    mute_microphone?: boolean;
    is_admin?: boolean;
}

/**
 * Creates a NIP-98 authorization header
 */
async function createNip98AuthHeader(user: NDKUser, method: string, url: string, body?: string): Promise<string> {
    if (!user.ndk?.signer) {
        throw new Error('User signer not found');
    }

    // Create the tags for the NIP-98 event
    const tags: string[][] = [
        ['u', url],
        ['method', method.toUpperCase()],
    ];

    // If there's a request body, include its SHA256 hash
    if (body) {
        const encoder = new TextEncoder();
        const data = encoder.encode(body);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const payloadHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        tags.push(['payload', payloadHash]);
    }

    // Create the event
    const event = new NDKEvent(user.ndk);
    event.kind = 27235;
    event.content = '';
    event.tags = tags;
    event.created_at = Math.floor(Date.now() / 1000);
    event.pubkey = user.pubkey;

    // Sign the event
    await event.sign();

    // Base64 encode the signed event
    const eventString = JSON.stringify(event.rawEvent());
    const encodedEvent = btoa(eventString);

    // Return the Authorization header value
    return `Nostr ${encodedEvent}`;
}

export const NestsApi = {
    async createNest(user: NDKUser, request: CreateNestRequest): Promise<CreateNestResponse> {
        const url = ALL_NESTS_API_BASE;
        const body = JSON.stringify(request);
        const authHeader = await createNip98AuthHeader(user, 'PUT', url, body);

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
            },
            body: body,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to create nest: ${response.statusText} - ${text}`);
        }

        return response.json();
    },

    async joinNest(user: NDKUser, roomId: string): Promise<JoinNestResponse> {
        const url = `${ALL_NESTS_API_BASE}/${roomId}`;
        const authHeader = await createNip98AuthHeader(user, 'GET', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
            },
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to join nest: ${response.statusText} - ${text}`);
        }

        return response.json();
    },

    async getNestInfo(roomId: string): Promise<NestInfo> {
        const url = `${ALL_NESTS_API_BASE}/${roomId}/info`;
        const response = await fetch(url, { method: 'GET' });

        if (!response.ok) {
            throw new Error(`Failed to get nest info: ${response.statusText}`);
        }

        return response.json();
    },

    async deleteNest(user: NDKUser, roomId: string): Promise<void> {
        const url = `${ALL_NESTS_API_BASE}/${roomId}`;
        const authHeader = await createNip98AuthHeader(user, 'DELETE', url);

        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Authorization': authHeader,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to delete nest: ${response.statusText}`);
        }
    },

    async updateNestPermissions(user: NDKUser, roomId: string, request: UpdatePermissionsRequest): Promise<void> {
        const url = `${ALL_NESTS_API_BASE}/${roomId}/permissions`;
        const body = JSON.stringify(request);
        const authHeader = await createNip98AuthHeader(user, 'POST', url, body);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
            },
            body: body,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to update permissions: ${response.statusText} - ${text}`);
        }
    }
};

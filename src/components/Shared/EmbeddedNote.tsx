import { useEffect, useState } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNostr } from '../../context/NostrContext';
import { RichTextRenderer } from './RichTextRenderer';

interface EmbeddedNoteProps {
    id: string;
}

export const EmbeddedNote = ({ id }: EmbeddedNoteProps) => {
    const { ndk } = useNostr();
    const [event, setEvent] = useState<NDKEvent | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!ndk || !id) return;
        setLoading(true);
        ndk.fetchEvent(id).then(e => {
            if (e) {
                e.author.fetchProfile();
                setEvent(e);
            }
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [ndk, id]);

    if (loading) return <div style={{ padding: '8px', background: '#f5f5f5', border: '1px solid #ccc', margin: '5px 0', fontSize: '0.8em', fontStyle: 'italic' }}>Loading embedded note...</div>;
    if (!event) return <div style={{ padding: '8px', background: '#fff0f0', border: '1px solid #ffcccc', margin: '5px 0', fontSize: '0.8em' }}>Note not found ({id.slice(0, 8)}...)</div>;

    return (
        <div className="embedded-note" style={{
            border: '1px solid #6699cc',
            background: '#fff',
            padding: '10px',
            margin: '8px 0',
            fontSize: '0.9em',
            borderRadius: '0',
            maxWidth: '100%',
            textAlign: 'left'
        }}>
            <div style={{ fontWeight: 'bold', fontSize: '0.85em', marginBottom: '8px', color: '#003399' }}>
                {event.author.profile?.name || event.author.pubkey.slice(0, 8)} said:
            </div>
            <div style={{ color: '#333' }}>
                <RichTextRenderer content={event.content} />
            </div>
            <div style={{ fontSize: '7.5pt', color: '#888', marginTop: '8px' }}>
                {new Date(event.created_at! * 1000).toLocaleString()}
            </div>
        </div>
    );
};

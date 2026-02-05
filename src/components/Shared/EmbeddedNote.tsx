import { useEffect, useState } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNavigate } from 'react-router-dom';
import { useNostr } from '../../context/NostrContext';
import { RichTextRenderer } from './RichTextRenderer';

interface EmbeddedNoteProps {
  id: string;
}

export const EmbeddedNote = ({ id }: EmbeddedNoteProps) => {
  const { ndk } = useNostr();
  const navigate = useNavigate();
  const [event, setEvent] = useState<NDKEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ndk || !id) return;

    // Use a flag to avoid setting state if already true,
    // though it's better to just start the fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    let isMounted = true;
    ndk
      .fetchEvent(id)
      .then((e) => {
        if (!isMounted) return;
        if (e) {
          e.author.fetchProfile();
          setEvent(e);
        }
        setLoading(false);
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [ndk, id]);

  if (loading)
    return (
      <div
        style={{
          padding: '8px',
          background: '#f5f5f5',
          border: '1px solid #ccc',
          margin: '5px 0',
          fontSize: '0.8em',
          fontStyle: 'italic',
        }}
      >
        Loading embedded note...
      </div>
    );
  if (!event)
    return (
      <div
        style={{
          padding: '8px',
          background: '#fff0f0',
          border: '1px solid #ffcccc',
          margin: '5px 0',
          fontSize: '0.8em',
        }}
      >
        Note not found ({id.slice(0, 8)}...)
      </div>
    );

  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking a link inside the embedded content
    if ((e.target as HTMLElement).closest('a')) return;
    navigate(`/thread/${event.id}`);
  };

  return (
    <div
      className="embedded-note"
      onClick={handleClick}
      style={{
        border: '1px solid #6699cc',
        background: '#fff',
        padding: '10px',
        margin: '8px 0',
        fontSize: '0.9em',
        borderRadius: '0',
        maxWidth: '100%',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          fontWeight: 'bold',
          fontSize: '0.85em',
          marginBottom: '8px',
          color: '#003399',
          textDecoration: 'underline',
        }}
      >
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

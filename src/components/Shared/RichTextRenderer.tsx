import React from 'react';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { EmbeddedNote } from './EmbeddedNote';
import { useLightbox } from '../../context/LightboxContext';
import { useProfile } from '../../hooks/useProfile';

const InternalMention: React.FC<{ pubkey: string; originalText: string }> = ({
  pubkey,
  originalText,
}) => {
  const { profile } = useProfile(pubkey);
  const name =
    profile?.name ||
    profile?.displayName ||
    profile?.display_name ||
    originalText.replace('nostr:', '').slice(0, 10) + '...';
  return (
    <Link
      to={`/p/${pubkey}`}
      style={{ color: '#003399', fontWeight: 'bold', textDecoration: 'none' }}
    >
      @{name}
    </Link>
  );
};

interface RichTextRendererProps {
  content: string;
  style?: React.CSSProperties;
  className?: string;
}

const BLOCKED_KEYWORDS = ['xxx', 'porn'];

export const RichTextRenderer: React.FC<RichTextRendererProps> = React.memo(({
  content,
  style,
  className,
}) => {
  const { openLightbox } = useLightbox();
  if (!content) return null;

  const lines = content.split('\n');

  return (
    <div style={style} className={className}>
      {lines.map((line, lineIndex) => (
        <div
          key={lineIndex}
          style={{
            minHeight: '1em',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
          }}
        >
          {line.split(' ').map((word, wordIndex) => {
            const lowerWord = word.toLowerCase();
            const isBlocked = BLOCKED_KEYWORDS.some((keyword) => lowerWord.includes(keyword));

            if (isBlocked) {
              return null;
            }

            // URL Handling
            const isUrl = word.match(/^https?:\/\/[^\s]+$/);
            if (isUrl) {
              const url = word;
              const lowerUrl = url.toLowerCase();

              // Image
              if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/)) {
                return (
                  <div
                    key={wordIndex}
                    style={{ marginTop: '5px', marginBottom: '5px', display: 'block' }}
                  >
                    <img
                      src={url}
                      alt="Embedded content"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '400px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                      onClick={() => openLightbox(url)}
                      loading="lazy"
                    />
                  </div>
                );
              }

              // Video
              if (lowerUrl.match(/\.(mp4|mov|webm)(\?.*)?$/)) {
                return (
                  <div
                    key={wordIndex}
                    style={{ marginTop: '5px', marginBottom: '5px', display: 'block' }}
                  >
                    <video
                      src={url}
                      controls
                      style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px' }}
                    />
                  </div>
                );
              }

              // YouTube
              if (lowerUrl.includes('youtube.com/watch') || lowerUrl.includes('youtu.be/')) {
                let videoId = null;
                if (url.includes('v=')) {
                  videoId = url.split('v=')[1]?.split('&')[0];
                } else if (url.includes('youtu.be/')) {
                  videoId = url.split('youtu.be/')[1]?.split('?')[0];
                }

                if (videoId) {
                  return (
                    <div
                      key={wordIndex}
                      style={{ marginTop: '5px', marginBottom: '5px', display: 'block' }}
                    >
                      <iframe
                        width="100%"
                        height="315"
                        src={`https://www.youtube.com/embed/${videoId}`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="Embedded Video"
                        style={{ maxWidth: '560px' }}
                        loading="lazy"
                      ></iframe>
                    </div>
                  );
                }
              }

              return (
                <span key={wordIndex}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ wordBreak: 'break-all' }}
                  >
                    {url}
                  </a>{' '}
                </span>
              );
            }

            // Nostr Entity Handling
            const isNostrMatch = word.match(
              /^nostr:((npub1|nprofile1|note1|nevent1|naddr1)[a-z0-9]+)$/i
            );
            if (isNostrMatch) {
              const entity = isNostrMatch[1];
              try {
                const decoded = nip19.decode(entity);
                const type = decoded.type;
                const data = decoded.data;

                if (type === 'npub' || type === 'nprofile') {
                  const pubkey =
                    type === 'npub' ? (data as string) : (data as { pubkey: string }).pubkey;
                  return <InternalMention key={wordIndex} pubkey={pubkey} originalText={word} />;
                }

                if (type === 'note' || type === 'nevent') {
                  const id = type === 'note' ? (data as string) : (data as { id: string }).id;
                  return <EmbeddedNote key={wordIndex} id={id} />;
                }

                if (type === 'naddr') {
                  const d = data as { kind: number; pubkey: string; identifier: string };
                  let link = `/p/${d.pubkey}`;
                  if (d.kind === 30023) link = `/blog/${d.pubkey}/${d.identifier}`;
                  else if (d.kind === 30311) link = `/live/${d.pubkey}/${d.identifier}`;

                  return (
                    <Link
                      key={wordIndex}
                      to={link}
                      style={{ color: '#003399', fontWeight: 'bold' }}
                    >
                      {word.slice(0, 20)}...
                    </Link>
                  );
                }
              } catch (e) {
                console.warn('Failed to decode nostr entity', word, e);
              }
            }

            return <span key={wordIndex}>{word} </span>;
          })}
        </div>
      ))}
    </div>
  );
});

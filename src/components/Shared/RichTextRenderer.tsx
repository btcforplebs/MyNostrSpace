import React, { useRef } from 'react';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { EmbeddedNote } from './EmbeddedNote';
import { useLightbox } from '../../context/LightboxContext';
import { useProfile } from '../../hooks/useProfile';

const InternalMention: React.FC<{ pubkey: string; originalText: string }> = React.memo(
  ({ pubkey, originalText }) => {
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
  }
);

// Lazy-loaded image component with loading="lazy" (native browser support)
// This is more reliable across browsers including Safari
const LazyImage: React.FC<{ src: string; alt: string; onClick: () => void }> = React.memo(
  ({ src, alt, onClick }) => {
    const [isInView, setIsInView] = React.useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    React.useEffect(() => {
      const img = imgRef.current;
      if (!img) return;

      // Use native loading="lazy" as primary mechanism
      // IntersectionObserver is just to track when image enters viewport
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        },
        { rootMargin: '50px', threshold: 0 }
      );

      observer.observe(img);
      return () => observer.disconnect();
    }, []);

    return (
      <img
        ref={imgRef}
        src={isInView ? src : undefined}
        alt={alt}
        style={{
          maxWidth: '100%',
          maxHeight: '400px',
          borderRadius: '4px',
          cursor: 'pointer',
          backgroundColor: isInView ? undefined : '#f0f0f0',
          minHeight: '200px',
          display: 'block',
        }}
        onClick={onClick}
        loading="lazy"
        decoding="async"
      />
    );
  }
);

// Lazy-loaded video component with intersection observer
// With Safari fallback timeout
const LazyVideo: React.FC<{ src: string }> = React.memo(({ src }) => {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Safari fallback: timeout to ensure video loads even if observer fails
    const fallbackTimer = setTimeout(() => {
      if (!isLoaded) setIsLoaded(true);
    }, 2000);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsLoaded(true);
          clearTimeout(fallbackTimer);
          observer.disconnect();
        }
      },
      { rootMargin: '100px', threshold: 0 }
    );

    observer.observe(video);
    return () => {
      clearTimeout(fallbackTimer);
      observer.disconnect();
    };
  }, [isLoaded]);

  const videoSrc = isLoaded ? (src.includes('#') ? src : `${src}#t=0.1`) : undefined;

  return (
    <video
      ref={videoRef}
      src={videoSrc}
      controls
      preload={isLoaded ? 'metadata' : 'none'}
      playsInline
      muted
      style={{
        maxWidth: '100%',
        maxHeight: '400px',
        borderRadius: '4px',
        backgroundColor: '#f0f0f0',
        minHeight: '200px',
        display: 'block',
      }}
    />
  );
});

// Lazy-loaded YouTube component with intersection observer
// With Safari fallback timeout to ensure content loads
const LazyYouTube: React.FC<{ videoId: string; style?: React.CSSProperties }> = React.memo(
  ({ videoId, style }) => {
    const [isLoaded, setIsLoaded] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      if (isLoaded) return;

      const container = containerRef.current;
      if (!container) return;

      // Safari fallback: timeout to ensure YouTube loads even if observer fails
      const fallbackTimer = setTimeout(() => {
        if (!isLoaded) setIsLoaded(true);
      }, 2000);

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            setIsLoaded(true);
            clearTimeout(fallbackTimer);
            observer.disconnect();
          }
        },
        { rootMargin: '100px', threshold: 0 }
      );

      observer.observe(container);
      return () => {
        clearTimeout(fallbackTimer);
        observer.disconnect();
      };
    }, [isLoaded]);

    return (
      <div
        ref={containerRef}
        style={{
          ...style,
          width: style?.width || '100%',
          height: style?.height || '315px',
          maxWidth: '560px',
          backgroundColor: isLoaded ? '#fff' : '#f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!isLoaded && (
          <div style={{ color: '#999', fontSize: '14px' }}>Loading video...</div>
        )}
        {isLoaded && (
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${videoId}`}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Embedded Video"
            style={{ border: 'none' }}
          />
        )}
      </div>
    );
  }
);

interface RichTextRendererProps {
  content: string;
  style?: React.CSSProperties;
  className?: string;
  depth?: number;
}

const BLOCKED_KEYWORDS = ['xxx', 'porn'];

export const RichTextRenderer: React.FC<RichTextRendererProps> = React.memo(
  ({ content, style, className, depth = 0 }) => {
    const { openLightbox } = useLightbox();
    if (!content) return null;

    // Prevent deep recursion
    if (depth > 1) {
      return (
        <div style={style} className={className}>
          {content}
        </div>
      );
    }

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
                      <LazyImage
                        src={url}
                        alt="Embedded content"
                        onClick={() => openLightbox(url)}
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
                      <LazyVideo src={url} />
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
                      <LazyYouTube
                        key={wordIndex}
                        videoId={videoId}
                        style={{ marginTop: '5px', marginBottom: '5px', display: 'block' }}
                      />
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
                    if (!pubkey) return <span key={wordIndex}>{word} </span>;
                    return <InternalMention key={wordIndex} pubkey={pubkey} originalText={word} />;
                  }

                  if (type === 'note' || type === 'nevent') {
                    const id = type === 'note' ? (data as string) : (data as { id: string }).id;
                    if (!id) return <span key={wordIndex}>{word} </span>;
                    return <EmbeddedNote key={wordIndex} id={id} depth={depth + 1} />;
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
  }
);

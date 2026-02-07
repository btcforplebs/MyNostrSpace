import React, { useState, useRef, useEffect } from 'react';

interface VideoThumbnailProps {
  src: string;
  poster?: string;
  style?: React.CSSProperties;
  className?: string;
}

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({ src, poster, style, className }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState(false);

  // Add media fragment for Safari if not present and no poster
  const videoSrc = src.includes('#') || poster ? src : `${src}#t=0.1`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || poster) return;

    // Seek to 1 second to get a representative frame (not just black)
    const handleLoadedMetadata = () => {
      if (video.duration > 1) {
        video.currentTime = 1;
      }
    };

    const handleError = () => {
      setHasError(true);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
  }, [src, poster]);

  if (hasError) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          fontSize: '12px',
          ...style,
        }}
        className={className}
      >
        ▶ Video
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={videoSrc}
      poster={poster}
      preload="metadata"
      muted
      playsInline
      style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }}
      className={className}
    />
  );
};

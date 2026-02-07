import React, { useState, useRef, useEffect } from 'react';

interface VideoThumbnailProps {
  src: string;
  style?: React.CSSProperties;
  className?: string;
}

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({ src, style, className }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

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
  }, [src]);

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
      src={src}
      preload="metadata"
      muted
      playsInline
      style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }}
      className={className}
    />
  );
};

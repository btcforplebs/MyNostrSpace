import React, { useMemo, useState } from 'react';

interface AvatarProps {
  pubkey?: string;
  src?: string;
  className?: string;
  style?: React.CSSProperties;
  size?: number;
  onClick?: (e: React.MouseEvent) => void;
}

// Generate a deterministic color from a pubkey
function hashToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 50%)`;
}

// Generate initials from pubkey (first 2 chars of hex)
function getInitials(pubkey: string): string {
  if (!pubkey) return '??';
  // Get first 2 hex characters
  return pubkey.slice(0, 2).toUpperCase();
}

export const Avatar: React.FC<AvatarProps> = ({
  pubkey,
  src,
  className,
  style,
  size = 50,
  onClick,
}) => {
  const [imgError, setImgError] = useState(false);

  // Memoize the fallback color to avoid recalculating on every render
  const bgColor = useMemo(() => pubkey ? hashToColor(pubkey) : '#888', [pubkey]);
  const initials = useMemo(() => pubkey ? getInitials(pubkey) : '??', [pubkey]);

  // Use native browser lazy loading for the image
  const showFallback = !src || imgError;

  const handleError = () => {
    setImgError(true);
  };

  // If there's no src or image failed to load, show our SVG identicon
  if (showFallback) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          backgroundColor: bgColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 'bold',
          fontSize: size > 40 ? '18px' : '14px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          flexShrink: 0,
          ...style,
        }}
        onClick={onClick}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ position: 'absolute' }}
        >
          <rect width={size} height={size} fill={bgColor} />
          <text
            x="50%"
            y="50%"
            dominantBaseline="central"
            textAnchor="middle"
            fill="#fff"
            fontSize={size > 40 ? 18 : 14}
            fontWeight="bold"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {initials}
          </text>
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: 'cover',
        backgroundColor: '#f0f0f0',
        ...style,
      }}
      onError={handleError}
      onClick={onClick}
      loading="lazy"
    />
  );
};

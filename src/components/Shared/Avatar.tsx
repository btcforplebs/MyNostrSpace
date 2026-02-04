import React from 'react';

interface AvatarProps {
  pubkey?: string;
  src?: string;
  className?: string;
  style?: React.CSSProperties;
  size?: number;
  onClick?: (e: React.MouseEvent) => void;
}

export const Avatar: React.FC<AvatarProps> = ({
  pubkey,
  src,
  className,
  style,
  size = 50,
  onClick,
}) => {
  // Use robohash or dicebear as a reliable identicon fallback
  // Robohash is very stable and doesn't require an API key
  const fallback = pubkey
    ? `https://robohash.org/${pubkey}.png?set=set4&bgset=bg1&size=${size}x${size}`
    : `https://via.placeholder.com/${size}?text=No+User`; // Last resort, but robobhash should handle pubkeys

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    if (target.src !== fallback) {
      target.src = fallback;
    }
  };

  return (
    <img
      src={src || fallback}
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
    />
  );
};

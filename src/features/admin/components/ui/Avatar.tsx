import React, { type ReactNode } from 'react';

export interface AvatarProps {
  name?: string;
  children?: ReactNode;
  className?: string;
}

export function Avatar({ name, children, className = '' }: AvatarProps) {
  let initials = children;
  if (!initials && name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      initials = `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    } else if (parts[0]) {
      initials = parts[0].slice(0, 2).toUpperCase();
    }
  }

  return (
    <div className={`avatar ${className}`.trim()} aria-label={name}>
      {initials || '?'}
    </div>
  );
}

export default Avatar;

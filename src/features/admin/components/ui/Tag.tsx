import React, { type ReactNode } from 'react';

export interface TagProps {
  children: ReactNode;
  isDefault?: boolean;
  className?: string;
}

export function Tag({ children, isDefault = false, className = '' }: TagProps) {
  return (
    <span className={`tag ${className}`.trim()}>
      {isDefault && <span className="default-dot" aria-label="Default" title="Default" />}
      {children}
    </span>
  );
}

export default Tag;

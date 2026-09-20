import React, { type ReactNode } from 'react';

export interface SectionNoteProps {
  children: ReactNode;
  className?: string;
}

export function SectionNote({ children, className = '' }: SectionNoteProps) {
  return <span className={`section-note ${className}`.trim()}>{children}</span>;
}

export default SectionNote;

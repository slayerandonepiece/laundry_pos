import React, { type ButtonHTMLAttributes, type ReactNode } from 'react';

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  active?: boolean;
  className?: string;
}

export function Pill({ children, active = false, className = '', type = 'button', ...props }: PillProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={`pill ${active ? 'active' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export default Pill;

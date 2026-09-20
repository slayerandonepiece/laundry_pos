import React, { type ReactNode } from 'react';

export type BadgeTone = 'on' | 'off' | 'warn';

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  variant?: BadgeTone | 'success' | 'warning' | 'default';
  className?: string;
  on?: boolean;
  off?: boolean;
  warn?: boolean;
}

export function Badge({ children, tone, variant, on, off, warn, className = '' }: BadgeProps) {
  let resolvedTone = tone;
  if (variant) {
    if (variant === 'success') resolvedTone = 'on';
    else if (variant === 'warning') resolvedTone = 'warn';
    else if (variant === 'default') resolvedTone = 'off';
    else resolvedTone = variant;
  } else if (on) resolvedTone = 'on';
  else if (off) resolvedTone = 'off';
  else if (warn) resolvedTone = 'warn';

  if (!resolvedTone && typeof children === 'string') {
    const text = children.trim().toLowerCase();
    if (['active', 'completed', 'delivered', 'paid', 'on', 'ready'].includes(text)) {
      resolvedTone = 'on';
    } else if (['inactive', 'cancelled', 'canceled', 'off', 'closed', 'archived'].includes(text)) {
      resolvedTone = 'off';
    } else if (['pending', 'in progress', 'unpaid', 'part-paid', 'due', 'warn', 'warning', 'overdue'].includes(text)) {
      resolvedTone = 'warn';
    } else {
      resolvedTone = 'off';
    }
  }

  const toneClass = resolvedTone ? resolvedTone : 'off';

  return (
    <span className={`badge ${toneClass} ${className}`.trim()}>
      {children}
    </span>
  );
}

export default Badge;

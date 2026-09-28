'use client';
import type { InputHTMLAttributes } from 'react';

export default function DateInput({ onClick, className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type="date" className={`ad-date-input ${className}`.trim()} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    try { event.currentTarget.showPicker?.(); } catch { /* Native editing remains available when showPicker is unsupported. */ }
  }} />;
}

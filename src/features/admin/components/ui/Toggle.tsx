'use client';

import React from 'react';

export interface ToggleProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  'aria-label'?: string;
  className?: string;
}

export function Toggle({
  id,
  checked,
  onChange,
  disabled = false,
  label,
  'aria-label': ariaLabel,
  className = '',
}: ToggleProps) {
  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || label || 'Active'}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`toggle ${checked ? 'on' : ''} ${className}`.trim()}
    >
      <span className="knob" />
    </button>
  );
}

export default Toggle;

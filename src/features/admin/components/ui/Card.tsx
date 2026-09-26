import React, { type ReactNode, type HTMLAttributes } from 'react';

export interface CardHeadingProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function CardHeading({ title, subtitle, action, className = '' }: CardHeadingProps) {
  return (
    <div className={`card-heading ${className}`.trim()}>
      <div>
        {typeof title === 'string' ? <h2>{title}</h2> : title}
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div className={`card ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export default Card;

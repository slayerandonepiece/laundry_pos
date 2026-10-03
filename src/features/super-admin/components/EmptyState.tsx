import type { ReactNode } from 'react';
import type { IconName } from './Icon';
import Icon from './Icon';

/**
 * Reusable empty-state block used inside a .card when a list has no items.
 * Renders: large icon → heading → body text → optional action (button/link).
 */
export default function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="card">
      <div className="empty">
        <div className="empty-icon-wrap" aria-hidden="true">
          <Icon name={icon} size="l" />
        </div>
        <h3>{title}</h3>
        <p>{body}</p>
        {action}
      </div>
    </div>
  );
}

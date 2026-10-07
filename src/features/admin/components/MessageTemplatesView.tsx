'use client';

import type { OrganizationMessageTemplateDTO } from '@/server/services/message-templates';
import { Badge, Card, CardHeading } from '@/features/admin/components/ui';
import { MESSAGE_ATTACHMENT_LABELS, MESSAGE_STATUS_ORDER, MESSAGE_STATUS_TITLES, fillSampleMessage } from '@/features/super-admin/messageTemplates';

// Customer message templates are written and enabled by the platform administrator.
// Owners see what staff can share at each order status but cannot edit it.
export default function MessageTemplatesView({ templates }: { templates: OrganizationMessageTemplateDTO[] }) {
  const ordered = MESSAGE_STATUS_ORDER.flatMap(status => templates.filter(template => template.statusKey === status));
  if (!ordered.length) return <Card><p className="ad-billing-empty">No customer messages are set up for this organization yet.</p></Card>;
  const on = ordered.filter(template => template.enabled).length;
  return (
    <div className="ad-profile-stack">
      <p className="ad-msg-summary"><strong>{on} of {ordered.length}</strong> messages are on. When an order reaches an “on” status, staff see a <b>Share update</b> button that fills in the message below. Previews use sample details (customer Ravi, order 1000004314). Contact support to change the wording.</p>
      <div className="ad-msg-grid">
        {ordered.map(template => {
          const info = MESSAGE_STATUS_TITLES[template.statusKey];
          return (
            <Card key={template.statusKey} className={'ad-msg-card' + (template.enabled ? '' : ' off')}>
              <CardHeading title={info.title} subtitle={info.when} action={<Badge tone={template.enabled ? 'on' : 'off'}>{template.enabled ? 'On' : 'Off'}</Badge>} />
              <div className="ad-msg-bubble" aria-label={`Preview of the ${info.title} message`}>{fillSampleMessage(template.body)}</div>
              <p className="ad-msg-meta">
                {template.enabled ? (template.attachment !== 'NONE' ? `Attaches: ${MESSAGE_ATTACHMENT_LABELS[template.attachment]}` : 'No attachment') : 'Not offered to staff while off'}
              </p>
              <details className="ad-msg-template"><summary>View template</summary><pre>{template.body}</pre></details>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

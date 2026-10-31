'use client';
import type { ReactNode } from 'react';
import {
  MESSAGE_ATTACHMENT_LABELS,
  MESSAGE_PLACEHOLDERS,
  MESSAGE_STATUS_TITLES,
  fillSampleMessage,
  messageProblem,
  type MessageAttachmentValue,
  type MessageStatus,
} from '../messageTemplates';

export interface MessageDraft { statusKey: MessageStatus; body: string; enabled: boolean; attachment: MessageAttachmentValue }

const ATTACHMENTS = Object.keys(MESSAGE_ATTACHMENT_LABELS) as MessageAttachmentValue[];

/**
 * Status list, editor and phone preview shared by the platform defaults page and the
 * organization Messages tab, so both screens read the same.
 */
export default function MessageWorkspace({ drafts, current, onSelect, onPatch, enabledNote, subtitle, headerAside, footer, message }: {
  drafts: MessageDraft[];
  current: MessageDraft;
  onSelect: (status: MessageStatus) => void;
  onPatch: (change: Partial<MessageDraft>) => void;
  enabledNote: string;
  subtitle?: string;
  headerAside?: ReactNode;
  footer: ReactNode;
  message?: ReactNode;
}) {
  const title = MESSAGE_STATUS_TITLES[current.statusKey];
  const problem = messageProblem(current.statusKey, current.body);
  const insert = (name: string) => onPatch({ body: `${current.body}${current.body && !current.body.endsWith(' ') ? ' ' : ''}{${name}}` });

  return <div className="mt">
    <div className="card mt-list">
      <div className="mt-items">
        {drafts.map((draft, index) => {
          const active = draft.statusKey === current.statusKey;
          return <button key={draft.statusKey} type="button" className={'mt-item' + (active ? ' on' : '')} aria-pressed={active} onClick={() => onSelect(draft.statusKey)}>
            <span className="mt-step">{index + 1}</span>
            <span className="mt-name">{MESSAGE_STATUS_TITLES[draft.statusKey].title}</span>
            <span className={'badge ' + (draft.enabled ? 'good' : 'gray')}>{draft.enabled ? 'On' : 'Off'}</span>
          </button>;
        })}
      </div>
    </div>

    <div className="card mt-edit">
      <div className="card-head">
        <div><h2>{title.title}</h2><p>{subtitle ?? title.when}</p></div>
        <div className="mt-aside">{headerAside}
          <button type="button" role="switch" aria-checked={current.enabled} aria-label={`${current.enabled ? 'Disable' : 'Enable'} ${title.title} message`} className={'switch' + (current.enabled ? ' on' : '')} style={{ border: 0, padding: 0, cursor: 'pointer' }} onClick={() => onPatch({ enabled: !current.enabled })} />
        </div>
      </div>
      <div className="mt-body">
        <div className="mt-form">
          <div className="field">
            <label htmlFor="message-body">Message text <span className="mt-hint">{enabledNote}</span></label>
            <textarea id="message-body" rows={5} value={current.body} onChange={event => onPatch({ body: event.target.value })} />
            {problem && <p className="ad-error" role="alert">{problem}</p>}
          </div>
          <div>
            <div className="mt-label">Tap to insert</div>
            <div className="mt-chips">{MESSAGE_PLACEHOLDERS.map(name => <button key={name} type="button" className="mt-chip" onClick={() => insert(name)}>{`{${name}}`}</button>)}</div>
          </div>
          <div>
            <div className="mt-label" id="mt-attach">Attachment</div>
            <div className="mt-seg" role="group" aria-labelledby="mt-attach">
              {ATTACHMENTS.map(value => <button key={value} type="button" className={value === current.attachment ? 'on' : ''} aria-pressed={value === current.attachment} onClick={() => onPatch({ attachment: value })}>{MESSAGE_ATTACHMENT_LABELS[value]}</button>)}
            </div>
          </div>
          {message}
          <div className="mt-foot">{footer}</div>
        </div>
        <div className="mt-phone" aria-label="Message preview">
          <div className="mt-who">Ravi · WhatsApp</div>
          <div className={'mt-bubble' + (current.enabled ? '' : ' off')}>{fillSampleMessage(current.body)}</div>
          {current.attachment !== 'NONE' && <div className="mt-att"><span className="mt-pdf">PDF</span><div><b>Order-1000004314.pdf</b><small>{MESSAGE_ATTACHMENT_LABELS[current.attachment]}</small></div></div>}
          {!current.enabled && <div className="mt-off">Off: staff are not offered this message.</div>}
        </div>
      </div>
    </div>
  </div>;
}

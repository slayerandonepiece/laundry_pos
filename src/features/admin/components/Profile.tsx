'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Profile as ProfileType, Role } from '../admin.types';
import type { OrganizationPaymentMethodDTO } from '@/server/services/platform-payment-methods';
import type { OutletListItem } from '@/features/super-admin/types';
import { Card, CardHeading, Badge, Dialog, useDialog } from '@/features/admin/components/ui';
import { Button } from './Primitives';
import PaymentMethodsSettings from './PaymentMethodsSettings';
import MessageTemplatesView from './MessageTemplatesView';
import type { OrganizationMessageTemplateDTO } from '@/server/services/message-templates';
import { outletStatusBadge } from './OutletsList';
import type { ProfileSection } from '../profile-sections';

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function Profile({
  section = 'account',
  readOnly = false,
  role = 'owner',
  profile: p,
  paymentMethods,
  messageTemplates = [],
  outlets,
  passwordUpdatedAt,
  phone = '',
  onSave,
  onPassword,
  onLogout,
  onRequestDeletion,
  error
}: {
  section?: ProfileSection;
  readOnly?: boolean;
  role?: Role;
  profile: ProfileType;
  paymentMethods: OrganizationPaymentMethodDTO[];
  messageTemplates?: OrganizationMessageTemplateDTO[];
  outlets: OutletListItem[];
  passwordUpdatedAt?: string;
  phone?: string;
  onSave: (p: ProfileType) => void;
  onPassword: (old: string, next: string, confirm: string) => Promise<boolean>;
  onLogout: () => void;
  onRequestDeletion?: () => void;
  error: string;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const isPasswordValid = Boolean(
    oldPassword &&
    newPassword.length >= 8 &&
    newPassword !== oldPassword &&
    newPassword === confirmPassword
  );

  return (
    <div className="ad-profile-stack">
      {section === 'account' && <>
        <Card className="ad-profile-hero">
          <span className="ad-profile-avatar" aria-hidden="true">{(p.name || '?').slice(0, 1).toUpperCase()}</span>
          <div className="ad-profile-hero-text">
            <h2>{p.name}</h2>
            <p>{role === 'employee' ? 'Employee' : 'Owner'}{p.store ? ` · ${p.store}` : ''}</p>
            <p>{phone ? `Signs in with ${phone}` : ''}</p>
          </div>
          <Button secondary onClick={onLogout}>Log out &rarr;</Button>
        </Card>
        <div className="ad-profile-split">
          <Card>
            <CardHeading title="Account details" />
            <dl className="ad-profile-details ad-profile-dl2">
              <div><dt>Name</dt><dd>{p.name}</dd></div>
              <div><dt>Login phone</dt><dd>{phone || '—'}</dd></div>
              <div><dt>Role</dt><dd>{role === 'employee' ? 'Employee' : 'Owner'}</dd></div>
              <div><dt>Organization</dt><dd>{p.store || '—'}</dd></div>
            </dl>
          </Card>
          <Card>
            <CardHeading
              title="Security"
              subtitle="Use a password of at least 8 characters that you don't use elsewhere."
              action={<Button disabled={readOnly} secondary onClick={() => {
                setOldPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setShowPasswordDialog(true);
              }}>Change password</Button>}
            />
            <dl className="ad-profile-details">
              <div><dt>Password last changed</dt><dd>{passwordUpdatedAt ? formatTimestamp(passwordUpdatedAt) : 'Unknown'}</dd></div>
            </dl>
          </Card>
        </div>
      </>}

      {role !== 'employee' && section === 'organization' && <>
        <Card>
          <CardHeading title="Organization details" subtitle="Shown on invoices and customer messages." action={<Button disabled={readOnly} secondary onClick={() => setShowEdit(true)}>Edit</Button>} />
          <dl className="ad-profile-details ad-profile-dl2">
            <div><dt>Organization name</dt><dd>{p.store || '—'}</dd></div>
            <div><dt>Contact phone</dt><dd>{p.phone || '—'}</dd></div>
            <div><dt>Email</dt><dd>{p.email || '—'}</dd></div>
            <div className="wide"><dt>Address</dt><dd>{p.address || '—'}</dd></div>
          </dl>
        </Card>
        <div>
          <div className="ad-profile-section-title"><h2>Outlets <span className="ad-count">{outlets.length}</span></h2><Link href="/admin/outlets" style={{ fontSize: '13px', fontWeight: 600 }}>Manage outlets &rarr;</Link></div>
          <div className="ad-outlet-cards">
            {outlets.map(outlet => {
              const { tone, label } = outletStatusBadge(outlet.status);
              return <Card className="ad-profile-outlet" key={outlet.id}>
                <div className="ad-row"><h3>{outlet.displayName}</h3><Badge tone={tone}>{label}</Badge></div>
                <dl className="ad-profile-details">
                  <div><dt>Outlet code</dt><dd>{outlet.outletCode}</dd></div>
                  <div><dt>Address</dt><dd>{outlet.address || '—'}</dd></div>
                  <div><dt>Phone</dt><dd>{outlet.phone || '—'}</dd></div>
                </dl>
              </Card>;
            })}
            {!outlets.length && <p>No outlets found.</p>}
          </div>
        </div>
        {onRequestDeletion && (
          <Card className="ad-danger-card">
            <CardHeading title="Delete organization" subtitle="Permanently deletes this organization and all of its data after a grace period (90 days by default). Signing in and restoring before then cancels it." action={<Button secondary disabled={readOnly} onClick={onRequestDeletion}>Request deletion</Button>} />
          </Card>
        )}
      </>}

      {role !== 'employee' && section === 'payments' && <PaymentMethodsSettings methods={paymentMethods} />}
      {role !== 'employee' && section === 'messages' && <MessageTemplatesView templates={messageTemplates} />}

      {showEdit && !readOnly && role !== 'employee' && (
        <Dialog title="Edit profile" onClose={() => setShowEdit(false)} warnOnChanges>
          <form className="ad-form" onSubmit={e => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            for (const name of ['name', 'store', 'address', 'phone']) {
              const value = String(f.get(name)).trim();
              const invalid = !value || (name === 'phone' && !/^\+?[0-9]{10,15}$/.test(value.replace(/[\s()-]/g, '')));
              if (invalid) {
                const input = e.currentTarget.elements.namedItem(name) as HTMLInputElement;
                input.setCustomValidity(name === 'phone' ? 'Enter a valid phone number with 10 to 15 digits.' : 'This field cannot be blank.');
                input.reportValidity();
                return;
              }
            }
            onSave({
              name: String(f.get('name')).trim(),
              phone: String(f.get('phone')).trim(),
              email: String(f.get('email')),
              store: String(f.get('store')).trim(),
              address: String(f.get('address')).trim()
            });
            setShowEdit(false);
          }}>
            <div className="ad-form-grid">
              <label htmlFor="prof-name">Owner name<input id="prof-name" name="name" defaultValue={p.name} required/></label>
              <label htmlFor="prof-phone">Login phone number<input id="prof-phone" value={phone} readOnly/></label>
              <label htmlFor="prof-phone">Phone<input id="prof-phone" name="phone" type="tel" pattern={'[+0-9 ()\\-]{10,18}'} title="Enter a valid phone number with 10 to 15 digits" aria-label="Phone" defaultValue={p.phone} required/></label>
              <label htmlFor="prof-email">Email<input id="prof-email" name="email" type="email" defaultValue={p.email}/></label>
            </div>
            <label htmlFor="prof-store">Store name<input id="prof-store" name="store" defaultValue={p.store} required/></label>
            <label htmlFor="prof-address">Store address<textarea id="prof-address" name="address" defaultValue={p.address} required/></label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <DialogCancelButton onClose={() => setShowEdit(false)} />
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </Dialog>
      )}

      {showPasswordDialog && !readOnly && (
        <Dialog title="Change password" onClose={() => setShowPasswordDialog(false)} warnOnChanges>
          <form className="ad-form" onSubmit={e => {
            e.preventDefault();
            if (!isPasswordValid || savingPassword) return;
            setSavingPassword(true);
            onPassword(oldPassword, newPassword, confirmPassword).then(ok => {
              setSavingPassword(false);
              if (ok) {
                setShowPasswordDialog(false);
              }
            }).catch(() => {
              setSavingPassword(false);
            });
          }}>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 12px' }}>
              Passwords must be at least 8 characters and differ from your current password.
            </p>
            <label htmlFor="pwd-old">
              Current password
              <input
                id="pwd-old"
                name="old"
                type={showPassword ? 'text' : 'password'}
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <label htmlFor="pwd-next">
              New password
              <input
                id="pwd-next"
                name="next"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              {newPassword.length > 0 && newPassword.length < 8 && (
                <small style={{ color: 'var(--muted)' }}>{8 - newPassword.length} more characters needed</small>
              )}
              {newPassword.length >= 8 && oldPassword && newPassword === oldPassword && (
                <small style={{ color: '#c0362c' }}>New password must differ from current password</small>
              )}
            </label>
            <label htmlFor="pwd-confirm">
              Confirm new password
              <input
                id="pwd-confirm"
                name="confirm"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <small style={{ color: '#c0362c' }}>Passwords do not match</small>
              )}
            </label>
            <label className="ad-checkbox">
              <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)}/>
              Show passwords
            </label>
            {error && <p className="ad-error" role="alert">{error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <DialogCancelButton onClose={() => setShowPasswordDialog(false)} />
              <Button type="submit" disabled={!isPasswordValid || savingPassword}>
                {savingPassword ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

function DialogCancelButton({ onClose }: { onClose: () => void }) {
  const { requestClose } = useDialog();
  return (
    <Button secondary type="button" onClick={requestClose || onClose}>
      Cancel
    </Button>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Profile as ProfileType } from '../admin.types';
import type { OrganizationPaymentMethodDTO } from '@/server/services/platform-payment-methods';
import type { OutletListItem, StoreDetail } from '@/features/super-admin/types';
import { Card, CardHeading, Badge, Dialog } from '@/features/admin/components/ui';
import { Button } from './Primitives';
import PaymentMethodsSettings from './PaymentMethodsSettings';
import { money, dateLabel } from '@/features/admin/admin.data';

export default function Profile({
  profile: p,
  paymentMethods,
  outlets,
  storeInfo,
  passwordUpdatedAt,
  username = 'admin',
  onSave,
  onPassword,
  onLogout,
  error
}: {
  profile: ProfileType;
  paymentMethods: OrganizationPaymentMethodDTO[];
  outlets: OutletListItem[];
  storeInfo: StoreDetail | null;
  passwordUpdatedAt?: string;
  username?: string;
  onSave: (p: ProfileType) => void;
  onPassword: (old: string, next: string, confirm: string) => Promise<boolean>;
  onLogout: () => void;
  error: string;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="ad-profile-grid">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <Card>
          <CardHeading 
            title="Profile details" 
            action={<Button secondary onClick={() => setShowEdit(true)}>Edit</Button>} 
          />
          <div style={{ display: 'grid', gap: '12px' }}>
            <div><small style={{ color: 'var(--muted)' }}>Name</small><div>{p.name}</div></div>
            <div><small style={{ color: 'var(--muted)' }}>Username</small><div>{username}</div></div>
            <div><small style={{ color: 'var(--muted)' }}>Phone</small><div>{p.phone}</div></div>
            <div><small style={{ color: 'var(--muted)' }}>Email</small><div>{p.email || '—'}</div></div>
          </div>
        </Card>

        <Card>
          <CardHeading 
            title="Security" 
            action={<Button secondary onClick={() => setShowPasswordDialog(true)}>Change password</Button>} 
          />
          <div>
            <small style={{ color: 'var(--muted)' }}>Password last changed</small>
            <div>{passwordUpdatedAt ? dateLabel(passwordUpdatedAt) : 'Unknown'}</div>
          </div>
        </Card>

        <Card>
          <CardHeading title="Billing & subscription" />
          <div style={{ display: 'grid', gap: '12px' }}>
            <div><small style={{ color: 'var(--muted)' }}>Current plan</small><div>{storeInfo?.planName || 'Custom'}</div></div>
            <div><small style={{ color: 'var(--muted)' }}>Deposit amount</small><div>{storeInfo?.depositAmount !== undefined ? money(storeInfo.depositAmount) : '—'}</div></div>
            <div><small style={{ color: 'var(--muted)' }}>Annual fee</small><div>{storeInfo?.annualFeeAmount !== undefined ? money(storeInfo.annualFeeAmount) : '—'}</div></div>
            <div><small style={{ color: 'var(--muted)' }}>Paid through date</small><div>{storeInfo?.paidThroughDate ? dateLabel(storeInfo.paidThroughDate) : 'Not set'}</div></div>
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <PaymentMethodsSettings methods={paymentMethods} />

        <Card>
          <CardHeading 
            title="Outlets" 
            action={<Link href="/admin/outlets" style={{ fontSize: '13px', fontWeight: 600 }}>View all &rarr;</Link>} 
          />
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', marginTop: '8px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--muted)' }}>
                <th style={{ paddingBottom: '8px', fontWeight: 'normal' }}>Code</th>
                <th style={{ paddingBottom: '8px', fontWeight: 'normal' }}>Outlet</th>
                <th style={{ paddingBottom: '8px', fontWeight: 'normal' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {outlets.slice(0, 5).map(outlet => (
                <tr key={outlet.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 0' }}>{outlet.outletCode}</td>
                  <td style={{ padding: '12px 0' }}>{outlet.displayName}</td>
                  <td style={{ padding: '12px 0' }}>
                    <Badge tone={outlet.status === 'ACTIVE' ? 'on' : 'off'}>{outlet.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {outlets.length === 0 && <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '12px' }}>No outlets found.</p>}
        </Card>

        <Card className="ad-account-card">
          <CardHeading title="Done for the day?" subtitle="Sign out of your store workspace." />
          <Button secondary onClick={onLogout}>Log out &rarr;</Button>
        </Card>
      </div>

      {showEdit && (
        <Dialog title="Edit profile" onClose={() => setShowEdit(false)}>
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
              <label>Owner name<input name="name" defaultValue={p.name} required/></label>
              <label>Username<input value={username} readOnly/></label>
              <label>Phone<input name="phone" type="tel" pattern={'[+0-9 ()\\-]{10,18}'} title="Enter a valid phone number with 10 to 15 digits" defaultValue={p.phone} required/></label>
              <label>Email<input name="email" type="email" defaultValue={p.email}/></label>
            </div>
            <label>Store name<input name="store" defaultValue={p.store} required/></label>
            <label>Store address<textarea name="address" defaultValue={p.address} required/></label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <Button secondary type="button" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </Dialog>
      )}

      {showPasswordDialog && (
        <Dialog title="Change password" onClose={() => setShowPasswordDialog(false)}>
          <form className="ad-form" onSubmit={e => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            onPassword(String(f.get('old')), String(f.get('next')), String(f.get('confirm'))).then(ok => {
              if (ok) {
                form.reset();
                setShowPasswordDialog(false);
              }
            });
          }}>
            <label>Current password<input name="old" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required/></label>
            <label>New password<input name="next" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required/></label>
            <label>Confirm new password<input name="confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required/></label>
            <label className="ad-checkbox">
              <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)}/>
              Show passwords
            </label>
            {error && <p className="ad-error" role="alert">{error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <Button secondary type="button" onClick={() => setShowPasswordDialog(false)}>Cancel</Button>
              <Button type="submit">Update password</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

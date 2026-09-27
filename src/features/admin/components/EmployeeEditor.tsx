'use client';
import { useState } from 'react';
import type { Employee } from '../admin.types';
import type { OutletListItem } from '@/features/super-admin/types';
import { Dialog, useDialog, MultiSelectDropdown, Tag, ErrorBanner } from '@/features/admin/components/ui';

export interface EmployeeDraft {
  name: string;
  phone: string;
  password?: string;
  active: boolean;
  outlets?: string[];
  defaultOutletId?: string;
}

export default function EmployeeEditor({ employee, outlets, error, onSave, onClose }: { employee?: Employee; outlets: OutletListItem[]; error: string; onSave: (draft: EmployeeDraft) => Promise<void>; onClose: () => void }) {
  const [activeOutlets, setActiveOutlets] = useState<string[]>(employee?.outlets?.map(o => o.id) || []);
  const [defaultOutlet, setDefaultOutlet] = useState<string>(employee?.defaultOutletId || activeOutlets[0] || '');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog
      isOpen={true}
      onClose={onClose}
      title={employee ? 'Edit employee' : 'Add employee'}
      warnOnChanges
      foot={<CancelableDialogFoot onClose={onClose} submitLabel={employee ? 'Save changes' : 'Save & create login'} saving={saving} />}
    >
      <form id="employee-form" className="employee-form" onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        setSaving(true);
        onSave({
          name: String(data.get('name')).trim(),
          phone: String(data.get('phone')).trim(),
          password: data.get('password') ? String(data.get('password')) : undefined,
          active: employee ? employee.active : true,
          outlets: activeOutlets,
          defaultOutletId: defaultOutlet
        }).catch(() => {}).finally(() => setSaving(false));
      }}>
        <div className="row" style={{ gap: '12px' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="emp-name">Name</label>
            <input id="emp-name" name="name" defaultValue={employee?.name} required maxLength={80} autoComplete="off"/>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="emp-phone">Phone number</label>
            <input id="emp-phone" type="tel" inputMode="numeric" name="phone" defaultValue={employee?.phone} required placeholder="Login phone number" autoComplete="off"/>
          </div>
        </div>
        <div className="row" style={{ gap: '12px' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="emp-password">Temporary password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="emp-password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                required={!employee}
                placeholder={employee ? 'Leave blank to keep current' : 'At least 8 characters'}
                minLength={8}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                style={{ paddingRight: '56px', width: '100%' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--brand)',
                  fontWeight: 600,
                  fontSize: '12px',
                  padding: '4px 6px',
                  lineHeight: 1
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>
        <div className="field" style={{ overflow: 'visible' }}>
          <label id="emp-outlets-label">Active outlets <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(select at least one)</span></label>
          <MultiSelectDropdown
            label="Outlets"
            options={outlets.map(o => ({ value: o.id, label: o.displayName }))}
            selected={activeOutlets}
            requireSelection
            immediate
            onChange={selected => {
              setActiveOutlets(selected);
              if (selected.length > 0 && !selected.includes(defaultOutlet)) {
                setDefaultOutlet(selected[0]);
              } else if (selected.length === 0) {
                setDefaultOutlet('');
              }
            }}
          />
          <div className="row" style={{ gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
            {activeOutlets.map(id => {
              const outlet = outlets.find(o => o.id === id);
              return outlet ? <Tag key={id}>{outlet.displayName}</Tag> : null;
            })}
          </div>
        </div>
        <div className="field">
          <label htmlFor="emp-default-outlet">Default outlet <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(must be one of the selected outlets above)</span></label>
          <select
            id="emp-default-outlet"
            value={defaultOutlet}
            onChange={e => setDefaultOutlet(e.target.value)}
            disabled={activeOutlets.length === 0}
            required
          >
            <option value="" disabled>Select default outlet</option>
            {activeOutlets.map(id => {
              const outlet = outlets.find(o => o.id === id);
              return outlet ? <option key={id} value={id}>{outlet.displayName}</option> : null;
            })}
          </select>
        </div>
        {error && <ErrorBanner message={error} />}
      </form>
    </Dialog>
  );
}

function CancelableDialogFoot({ onClose, submitLabel, saving }: { onClose: () => void; submitLabel: string; saving?: boolean }) {
  const { requestClose } = useDialog();
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={requestClose || onClose} disabled={saving}>Cancel</button>
      <button type="submit" form="employee-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : submitLabel}</button>
    </>
  );
}

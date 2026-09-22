'use client';
import { useState } from 'react';
import type { Employee } from '../admin.types';
import type { OutletListItem } from '@/features/super-admin/types';
import { Dialog, MultiSelectDropdown, Tag, ErrorBanner } from '@/features/admin/components/ui';

export interface EmployeeDraft { 
  name: string; 
  username: string; 
  password?: string; 
  active: boolean;
  outlets?: string[];
  defaultOutletId?: string;
}

export default function EmployeeEditor({ employee, outlets, error, onSave, onClose }: { employee?: Employee; outlets: OutletListItem[]; error: string; onSave: (draft: EmployeeDraft) => void; onClose: () => void }) {
  const [activeOutlets, setActiveOutlets] = useState<string[]>(employee?.outlets?.map(o => o.id) || []);
  const [defaultOutlet, setDefaultOutlet] = useState<string>(employee?.defaultOutletId || activeOutlets[0] || '');

  return (
    <Dialog 
      isOpen={true} 
      onClose={onClose} 
      title={employee ? 'Edit employee' : 'Add employee'} 
      wide 
      warnOnChanges
    >
      <form className="dialog-body" onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        onSave({ 
          name: String(data.get('name')).trim(), 
          username: String(data.get('username')).trim().toLowerCase(), 
          password: data.get('password') ? String(data.get('password')) : undefined, 
          active: employee ? employee.active : true,
          outlets: activeOutlets,
          defaultOutletId: defaultOutlet
        });
      }}>
        <div className="row" style={{ gap: '12px' }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Name</label>
            <input name="name" defaultValue={employee?.name} required maxLength={80} autoComplete="off"/>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Phone</label>
            <input name="phone" defaultValue="" placeholder="Optional" autoComplete="off"/>
          </div>
        </div>
        <div className="row" style={{ gap: '12px' }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Username</label>
            <input name="username" defaultValue={employee?.username} required minLength={3} maxLength={40} pattern="[a-zA-Z0-9._-]+" title="Use letters, numbers, dots, underscores or hyphens" autoComplete="off" autoCapitalize="none"/>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Temporary password</label>
            <input name="password" required={!employee} placeholder={employee ? 'Leave blank to keep current' : 'At least 8 characters'} minLength={8} autoComplete="new-password" autoCapitalize="none" spellCheck={false} />
          </div>
        </div>
        <div className="field" style={{ overflow: 'visible' }}>
          <label>Active outlets <span style={{ fontWeight: 400, color: 'var(--muted)' }}>— select at least one</span></label>
          <MultiSelectDropdown 
            label="Outlets" 
            options={outlets.map(o => ({ value: o.id, label: o.displayName }))} 
            selected={activeOutlets}
            requireSelection
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
          <label>Default outlet <span style={{ fontWeight: 400, color: 'var(--muted)' }}>— must be one of the selected outlets above</span></label>
          <select 
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
        <div className="dialog-foot" style={{ margin: '0 -21px -19px', padding: '15px 21px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{employee ? 'Save changes' : 'Save & create login'}</button>
        </div>
      </form>
    </Dialog>
  );
}

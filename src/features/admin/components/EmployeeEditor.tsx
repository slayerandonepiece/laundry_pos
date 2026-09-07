'use client';
import { useState } from 'react';
import type { Employee } from '../admin.types';
import { Button } from './Primitives';

export interface EmployeeDraft { name: string; username: string; password: string; active: boolean }
export default function EmployeeEditor({ employee, error, onSave }: { employee?: Employee; error: string; onSave: (draft: EmployeeDraft) => void }) {
  const [show, setShow] = useState(false);
  return <form className="ad-form" onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    onSave({ name: String(data.get('name')).trim(), username: String(data.get('username')).trim().toLowerCase(), password: String(data.get('password')), active: data.get('active') === 'on' });
  }}>
    <label>Employee name<input name="name" defaultValue={employee?.name} required maxLength={80} autoComplete="off"/></label>
    <label>Username<input name="username" defaultValue={employee?.username} required minLength={3} maxLength={40} pattern="[a-zA-Z0-9._-]+" title="Use letters, numbers, dots, underscores or hyphens" autoComplete="off" autoCapitalize="none"/></label>
    <label>{employee ? 'New password (optional)' : 'Password'}<input name="password" type={show ? 'text' : 'password'} required={!employee} minLength={8} autoComplete="new-password" placeholder={employee ? 'Leave blank to keep current password' : 'At least 8 characters'}/></label>
    <label className="ad-checkbox"><input type="checkbox" checked={show} onChange={event => setShow(event.target.checked)}/>Show password</label>
    <label className="ad-checkbox"><input type="checkbox" name="active" defaultChecked={employee?.active ?? true}/>Employee can sign in</label>
    <div className="ad-help"><strong>Employee access</strong><p>Use Sales to create orders and Orders to update their status. No dashboard, expenses, owner profile or team settings.</p></div>
    <p className="ad-help">Changing the username, password, or access here signs the employee out everywhere.</p>
    {error && <p role="alert" className="ad-error">{error}</p>}
    <Button type="submit">{employee ? 'Save employee' : 'Create employee'}</Button>
  </form>;
}

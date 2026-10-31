'use client';
import { useState } from 'react';
import PageHeading from './PageHeading';
import { Button } from '@/features/admin/components/Primitives';
import { saveAppUpdateSettingAction } from '../actions/app-updates.actions';
import type { AppUpdateSettingDTO } from '@/server/services/app-update-settings';

const LABELS = { ios: 'iOS', android: 'Android' } as const;

function PlatformForm({ setting }: { setting: AppUpdateSettingDTO }) {
  const [soft, setSoft] = useState(setting.softMinVersion ?? '');
  const [urgent, setUrgent] = useState(setting.urgentMinVersion ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function submit() {
    setBusy(true);
    setError('');
    setMessage('');
    saveAppUpdateSettingAction({ platform: setting.platform, softMinVersion: soft, urgentMinVersion: urgent })
      .then(result => {
        if (result.ok) setMessage('Saved. Takes effect within about 15 seconds.');
        else setError(result.error || 'Could not save.');
      })
      .catch(() => setError('Could not save.'))
      .finally(() => setBusy(false));
  }

  return <div className="ad-form" style={{ maxWidth: 420, marginBottom: 28 }}>
    <h3>{LABELS[setting.platform]}</h3>
    <label>
      Soft minimum version
      <input value={soft} onChange={e => setSoft(e.target.value)} placeholder="Unset" inputMode="decimal" />
    </label>
    <label>
      Urgent minimum version
      <input value={urgent} onChange={e => setUrgent(e.target.value)} placeholder="Unset" inputMode="decimal" />
    </label>
    {error && <p className="ad-error" role="alert">{error}</p>}
    {message && <p className="ad-help" role="status">{message}</p>}
    <div><Button type="button" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></div>
  </div>;
}

export default function AppUpdatesScreen({ settings }: { settings: AppUpdateSettingDTO[] }) {
  return <>
    <PageHeading icon="bell" title="App updates" subtitle="Mobile app versions below these minimums are told to update (soft or urgent). Leave blank to disable. Builds that send no version are never prompted." />
    {settings.map(s => <PlatformForm key={s.platform} setting={s} />)}
  </>;
}

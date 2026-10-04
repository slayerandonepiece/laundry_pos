'use server';

import { requireSuperAdmin } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';
import { saveAppUpdateSetting, type AppUpdateSettingDTO } from '@/server/services/app-update-settings';

export async function saveAppUpdateSettingAction(input: {
  platform: string;
  softMinVersion: string;
  urgentMinVersion: string;
}): Promise<{ ok: boolean; error?: string; setting?: AppUpdateSettingDTO }> {
  const session = await requireSuperAdmin();
  try {
    return { ok: true, setting: await saveAppUpdateSetting(input, session.id) };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

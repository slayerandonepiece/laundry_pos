'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/server/auth/session';
import { createEmployee, updateEmployee, toggleEmployeeActive } from '@/server/services/employees';
import { ValidationError } from '@/server/errors';
import type { Employee } from '../admin.types';
import type { EmployeeDraft } from '../components/EmployeeEditor';

export interface EmployeeActionResult {
  ok: boolean;
  error?: string;
  employee?: Employee;
}

export async function createEmployeeAction(draft: EmployeeDraft): Promise<EmployeeActionResult> {
  await requireSession('OWNER');
  try {
    const employee = await createEmployee(draft);
    revalidatePath('/admin/employees');
    return { ok: true, employee };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function updateEmployeeAction(id: string, draft: EmployeeDraft): Promise<EmployeeActionResult> {
  await requireSession('OWNER');
  try {
    const employee = await updateEmployee({ id, ...draft });
    revalidatePath('/admin/employees');
    return { ok: true, employee };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function toggleEmployeeActiveAction(id: string): Promise<Employee> {
  await requireSession('OWNER');
  const employee = await toggleEmployeeActive(id);
  revalidatePath('/admin/employees');
  return employee;
}

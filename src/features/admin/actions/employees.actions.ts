'use server';

import { revalidatePath } from 'next/cache';
import { requireStoreSession } from '@/server/auth/session';
import { createEmployee, updateEmployee, toggleEmployeeActive } from '@/server/services/employees';
import { assignEmployeeToOutlet, assignDefaultOutlet, removeEmployeeFromOutlet } from '@/server/services/outlets';
import { ValidationError } from '@/server/errors';
import type { Employee } from '../admin.types';
import type { EmployeeDraft } from '../components/EmployeeEditor';

export interface OutletAccessActionResult {
  ok: boolean;
  error?: string;
}

export interface EmployeeActionResult {
  ok: boolean;
  error?: string;
  employee?: Employee;
}

export async function createEmployeeAction(draft: EmployeeDraft): Promise<EmployeeActionResult> {
  const session = await requireStoreSession(undefined, 'OWNER');
  try {
    const employee = await createEmployee(session.storeId, draft);
    revalidatePath('/admin/employees');
    return { ok: true, employee };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function updateEmployeeAction(id: string, draft: EmployeeDraft): Promise<EmployeeActionResult> {
  const session = await requireStoreSession(undefined, 'OWNER');
  try {
    const employee = await updateEmployee(session.storeId, { id, ...draft });
    revalidatePath('/admin/employees');
    return { ok: true, employee };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function toggleEmployeeActiveAction(id: string): Promise<Employee> {
  const session = await requireStoreSession(undefined, 'OWNER');
  const employee = await toggleEmployeeActive(session.storeId, id);
  revalidatePath('/admin/employees');
  return employee;
}

/** Grants or revokes one employee's access to one outlet. Owner only. */
export async function setEmployeeOutletAccessAction(
  employeeId: string,
  outletId: string,
  grant: boolean,
): Promise<OutletAccessActionResult> {
  const session = await requireStoreSession(undefined, 'OWNER');
  try {
    if (grant) {
      await assignEmployeeToOutlet(employeeId, session.storeId, outletId);
    } else {
      await removeEmployeeFromOutlet(employeeId, session.storeId, outletId);
    }
    revalidatePath('/admin/employees');
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Sets one employee's default outlet, granting access to it if needed. Owner only. */
export async function setEmployeeDefaultOutletAction(
  employeeId: string,
  outletId: string,
): Promise<OutletAccessActionResult> {
  const session = await requireStoreSession(undefined, 'OWNER');
  try {
    await assignDefaultOutlet(employeeId, session.storeId, outletId);
    revalidatePath('/admin/employees');
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

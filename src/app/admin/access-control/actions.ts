'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { accessActor, requireAccess } from '@/lib/access-control/guards';
import { assignUserRoles, saveDepartment, saveRole } from '@/lib/access-control/store';

const field = (form: FormData, key: string) => typeof form.get(key) === 'string' ? String(form.get(key)).trim() : '';
async function save(form: FormData, section: string, change: (actor: Awaited<ReturnType<typeof accessActor>>) => Promise<unknown>) {
  const session = await requireAccess('access_control', 'manage_settings');
  const actor = await accessActor(session);
  let error = '';
  try { await change(actor); } catch (cause) { error = cause instanceof Error && /^access_[a-z_]+$/.test(cause.message) ? cause.message : 'access_action_failed'; }
  if (!error) { revalidatePath('/admin', 'layout'); revalidatePath('/admin/access-control'); }
  const params = new URLSearchParams({ section, [error ? 'error' : 'saved']: error || '1' });
  const userId = field(form, 'userId');
  if (/^[1-9]\d*$/.test(userId)) params.set('userId', userId);
  redirect(`/admin/access-control?${params}`);
}
export async function saveAccessDepartment(form: FormData) {
  return save(form, 'departments', actor => saveDepartment(prisma, actor, { id: field(form, 'id') || undefined, name: field(form, 'name'), active: form.get('active') === '1', reason: field(form, 'reason') }));
}
export async function saveAccessRole(form: FormData) {
  return save(form, 'roles', actor => saveRole(prisma, actor, { id: field(form, 'id') || undefined, name: field(form, 'name'), departmentId: field(form, 'departmentId'), active: form.get('active') === '1', permissions: form.getAll('permissions').map(String), reason: field(form, 'reason') }));
}
export async function assignAccessUserRoles(form: FormData) {
  return save(form, 'users', actor => assignUserRoles(prisma, actor, { userId: Number(field(form, 'userId')), roleIds: form.getAll('roleIds').map(String), reason: field(form, 'reason') }));
}

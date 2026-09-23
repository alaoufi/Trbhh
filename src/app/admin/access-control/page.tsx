import { prisma } from '@/lib/prisma';
import { hasAccess, requireAccess } from '@/lib/access-control/guards';
import { readAccessAdmin } from '@/lib/access-control/store';
import { AccessControlWorkspace } from '@/components/access-control';
import { DEPARTMENTS } from '@/lib/access-control/catalog';
import { assignAccessUserRoles, saveAccessDepartment, saveAccessRole, completeAccessDepartments } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الأقسام والأدوار والصلاحيات | تربح' };

export default async function AccessControlPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireAccess('access_control', 'view');
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.slice(0, 200) : '';
  const userId = typeof params.userId === 'string' && /^[1-9]\d{0,14}$/.test(params.userId) ? Number(params.userId) : undefined;
  const [data, canManage] = await Promise.all([readAccessAdmin(prisma, { q, userId }), hasAccess(session.uid, 'access_control', 'manage_settings')]);
  const missingDepartments = DEPARTMENTS.filter(department => !data.departments.some(saved => saved.id === department.id));
  return <div className="space-y-4">
    {data.ready && canManage && missingDepartments.length > 0 && <form action={completeAccessDepartments} className="space-y-3 rounded-xl border bg-amber-50 p-4 text-sm text-slate-900">
      <p>تحتاج هذه النسخة إلى استكمال {missingDepartments.length} أقسام أساسية: {missingDepartments.map(department => department.name).join('، ')}. تُضاف الأقسام وحدها وتبقى الأدوار والصلاحيات الحالية محفوظة.</p>
      <label className="block">سبب الاستكمال<input name="reason" required maxLength={1000} defaultValue="استكمال الأقسام الوظيفية المعتمدة لتربح" className="mt-1 block w-full rounded-lg border bg-white px-3 py-2" /></label>
      <button type="submit" className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground">استكمال الأقسام الأساسية</button>
    </form>}
    <AccessControlWorkspace data={data} currentUserId={session.uid} canManage={canManage} q={q} selectedUserId={userId} section={typeof params.section === 'string' ? params.section : 'roles'} notice={params.saved === '1' ? 'saved' : typeof params.error === 'string' ? params.error : ''} saveDepartmentAction={saveAccessDepartment} saveRoleAction={saveAccessRole} assignAction={assignAccessUserRoles} />
  </div>;
}

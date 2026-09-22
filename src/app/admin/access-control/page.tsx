import { prisma } from '@/lib/prisma';
import { hasAccess, requireAccess } from '@/lib/access-control/guards';
import { readAccessAdmin } from '@/lib/access-control/store';
import { AccessControlWorkspace } from '@/components/access-control';
import { assignAccessUserRoles, saveAccessDepartment, saveAccessRole } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الأقسام والأدوار والصلاحيات | تربح' };

export default async function AccessControlPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireAccess('access_control', 'view');
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.slice(0, 200) : '';
  const userId = typeof params.userId === 'string' && /^[1-9]\d{0,14}$/.test(params.userId) ? Number(params.userId) : undefined;
  const [data, canManage] = await Promise.all([readAccessAdmin(prisma, { q, userId }), hasAccess(session.uid, 'access_control', 'manage_settings')]);
  return <AccessControlWorkspace data={data} currentUserId={session.uid} canManage={canManage} q={q} selectedUserId={userId} section={typeof params.section === 'string' ? params.section : 'roles'} notice={params.saved === '1' ? 'saved' : typeof params.error === 'string' ? params.error : ''} saveDepartmentAction={saveAccessDepartment} saveRoleAction={saveAccessRole} assignAction={assignAccessUserRoles} />;
}

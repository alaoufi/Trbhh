import { redirect } from 'next/navigation';
import { requireAdminPage } from '@/lib/access-control/guards';
export default async function RolesPage(){ await requireAdminPage('/admin/roles'); redirect('/admin/access-control'); }

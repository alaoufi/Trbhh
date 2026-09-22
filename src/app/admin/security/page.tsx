import SecurityPage from '@/app/account/security/page';
import { requireAdminPage } from '@/lib/access-control/guards';
export { metadata } from '@/app/account/security/page';
export const dynamic = 'force-dynamic';
export default async function AdminSecurityPage(){ await requireAdminPage('/admin/security'); return <SecurityPage/>; }

import { redirect } from 'next/navigation';
import { requireAdminPage } from '@/lib/access-control/guards';
export default async function UserPermissions({params}:{params:Promise<{id:string}>}) { await requireAdminPage('/admin/users/[id]/permissions'); const {id}=await params; redirect('/admin/access-control?section=users&userId='+encodeURIComponent(id)); }

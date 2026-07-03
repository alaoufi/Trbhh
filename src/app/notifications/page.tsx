import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'التنبيهات' };

export default async function NotificationsPage() {
 const session = await getSession();
 if (!session) redirect('/login');
 const rows = await prisma.notfications.findMany({
 where: { user_id: String(session.uid) },
 orderBy: { id: 'desc' },
 take: 100,
 });
 return (
 <div className="mx-auto max-w-2xl space-y-4">
 <div className="flex items-center gap-2"><Bell className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold">التنبيهات</h1></div>
 {rows.length === 0 && (
 <div className="card-3d rounded-2xl p-8 text-center text-muted-foreground">
 <Bell className="mx-auto mb-2 h-8 w-8" /> لا توجد تنبيهات.
 </div>
 )}
 <ul className="divide-y card-3d rounded-xl ">
 {rows.map((n) => (
 <li key={String(n.id)}>
 <Link href={n.route || '#'} className="block p-3 hover:bg-secondary">
 <div className="font-medium">{n.title}</div>
 <div className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</div>
 </Link>
 </li>
 ))}
 </ul>
 </div>
 );
}

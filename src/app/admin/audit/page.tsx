import { ScrollText, User } from 'lucide-react';
import Link from 'next/link';
import { requireAction } from '@/lib/roles';
import { listAdminLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'سجل نشاط الإدارة' };

function fmt(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export default async function AdminAuditPage() {
  await requireAction('users', 'view');
  const rows = await listAdminLog(300);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">سجل نشاط الإدارة</h1>
      </div>
      <p className="text-sm text-muted-foreground">كل إجراء إداري مهم يُسجَّل تلقائياً: من نفّذه، وماذا فعل، ومتى — للمراجعة والمساءلة عند تعدد المشرفين.</p>

      {rows.length === 0 && <p className="py-10 text-center text-muted-foreground">لا يوجد نشاط مسجّل بعد.</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="card-3d flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm">
            <Link href={`/admin/users/${r.adminId}`} className="flex items-center gap-1 font-bold text-primary hover:underline"><User className="h-4 w-4" /> {r.adminName}</Link>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-extrabold text-primary">{r.action}</span>
            {r.target && <span className="text-xs font-bold text-foreground/80">{r.target}</span>}
            {r.note && <span className="text-xs text-muted-foreground">— {r.note}</span>}
            <span className="mr-auto text-[11px] text-muted-foreground">{fmt(r.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

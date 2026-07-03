import Link from 'next/link';
import { ShieldAlert, Ban, AlertTriangle, Copy, Waves } from 'lucide-react';
import { requirePerm } from '@/lib/roles';
import { getModLog } from '@/lib/moderation';
import { CATEGORY_LABEL, type GuardCategory } from '@/lib/content-guard';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'سجل الحماية' };

const KIND_LABEL: Record<string, { label: string; icon: React.ElementType }> = {
  content: { label: 'محتوى ممنوع', icon: ShieldAlert },
  duplicate: { label: 'إعلان مكرر', icon: Copy },
  flood: { label: 'إغراق (نشر متسارع)', icon: Waves },
};

export default async function AdminModeration() {
  await requirePerm('reports');
  const log = await getModLog(300);
  const bans = log.filter((e) => e.action === 'banned').length;
  const en = (n: number) => new Intl.NumberFormat('en-US').format(n);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">سجل الحماية</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        كل محاولة نشر محتوى ممنوع أو مكرّر أو إغراق تُسجَّل هنا تلقائياً. المحتوى غير الأخلاقي يحظر الحساب فوراً،
        والأمني/السياسي/المخدرات يُحظر عند التكرار.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="card-3d flex flex-col items-center gap-1 rounded-xl p-3 text-center">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <div className="text-xl font-bold text-primary">{en(log.length)}</div>
          <div className="text-[11px] text-muted-foreground">إجمالي الأحداث</div>
        </div>
        <div className="card-3d flex flex-col items-center gap-1 rounded-xl p-3 text-center">
          <Ban className="h-5 w-5 text-red-600" />
          <div className="text-xl font-bold text-red-600">{en(bans)}</div>
          <div className="text-[11px] text-muted-foreground">حسابات حُظرت</div>
        </div>
      </div>

      {log.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد أحداث مسجّلة بعد.</p>}

      <div className="space-y-2">
        {log.map((e) => {
          const k = KIND_LABEL[e.kind] || { label: e.kind, icon: AlertTriangle };
          const banned = e.action === 'banned';
          return (
            <div key={e.id} className={`card-3d flex flex-wrap items-center gap-2 rounded-xl p-3 ${banned ? '!border-red-400 bg-red-50' : ''}`}>
              <k.icon className={`h-4 w-4 shrink-0 ${banned ? 'text-red-600' : 'text-amber-600'}`} />
              <span className="text-sm font-bold text-primary">{k.label}</span>
              {e.category && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{CATEGORY_LABEL[e.category as GuardCategory] || e.category}</span>}
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${banned ? 'bg-red-600 text-white' : 'bg-amber-200 text-amber-900'}`}>
                {banned ? 'حظر الحساب' : 'رفض النشر'}
              </span>
              <Link href={`/admin/users/${e.userId}`} className="text-xs text-primary underline">عضو #{en(e.userId)}</Link>
              {e.snippet && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={e.snippet}>«{e.snippet}»</span>}
              <span className="text-xs text-muted-foreground">{timeAgo(e.createdAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

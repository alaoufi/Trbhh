import { AlertTriangle, User, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { requireAction } from '@/lib/roles';
import { listErrorLogs } from '@/lib/error-log';
import { clearErrorLogAction } from '../actions';
import { AdminPager } from '@/components/admin-pager';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'سجل الأخطاء التقنية' };

function fmt(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

const PAGE_SIZE = 30;

export default async function AdminErrorsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAction('users', 'edit');
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, parseInt(pageRaw || '1') || 1);
  const { rows, total } = await listErrorLogs(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-primary">سجل الأخطاء التقنية</h1>
        </div>
        {rows.length > 0 && (
          <form action={clearErrorLogAction}>
            <ConfirmSubmit msg="مسح كل سجل الأخطاء نهائياً؟" className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10">
              <Trash2 className="h-3.5 w-3.5" /> مسح السجل
            </ConfirmSubmit>
          </form>
        )}
      </div>
      <p className="text-sm text-muted-foreground">كل خطأ يعترض عضواً (شاشة «حدث خطأ غير متوقع») يُسجَّل هنا تلقائياً — رسالته ورابط الصفحة والعضو (إن كان مسجّلاً) — لاكتشاف الأعطال المتكررة قبل أن يبلّغ عنها أحد.</p>

      {rows.length === 0 && <p className="py-10 text-center text-muted-foreground">لا توجد أخطاء مسجّلة — ممتاز 🎉</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="card-3d space-y-1.5 rounded-xl p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-red-700">{r.message}</span>
              <span className="mr-auto text-[11px] text-muted-foreground">{fmt(r.at)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {r.userId ? (
                <Link href={`/users/${r.userId}`} className="flex items-center gap-1 font-bold text-primary hover:underline"><User className="h-3.5 w-3.5" /> {r.userName}</Link>
              ) : (
                <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> زائر</span>
              )}
              {r.url && <a href={r.url} target="_blank" className="max-w-[280px] truncate text-primary underline">{r.url}</a>}
              {r.digest && <span className="rounded bg-secondary px-1.5 py-0.5">#{r.digest}</span>}
            </div>
            {r.stack && (
              <details className="rounded-lg bg-secondary/40 p-2">
                <summary className="cursor-pointer text-[11px] font-bold text-muted-foreground">تفاصيل تقنية (stack trace)</summary>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground" dir="ltr">{r.stack}</pre>
              </details>
            )}
          </div>
        ))}
      </div>

      <AdminPager basePath="/admin/errors" page={page} pages={pages} total={total} params={{}} />
    </div>
  );
}

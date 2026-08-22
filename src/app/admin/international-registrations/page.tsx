import { Globe2, Check, XCircle, Trash2 } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireAction } from '@/lib/roles';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { deleteInternationalRegistrationAction, reviewInternationalRegistrationAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'طلبات التسجيل الدولي' };
type Request = { id: bigint; country: string; name: string; phone: string; email: string; reason: string; status: string; review_note: string | null; created_at: Date };

export default async function InternationalRegistrations({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireAction('users', 'edit');
  const { view } = await searchParams; const status = ['pending', 'approved', 'rejected'].includes(view || '') ? view! : 'pending';
  const rows = await prisma.$queryRawUnsafe<Request[]>('SELECT id,country,name,phone,email,reason,status,review_note,created_at FROM international_registration_requests WHERE status=? ORDER BY id DESC LIMIT 300', status).catch(() => []);
  return <div className="space-y-4"><div className="flex items-center gap-2"><Globe2 className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold text-primary">طلبات التسجيل الدولي</h1></div>
    <p className="text-sm text-muted-foreground">الأرقام خارج المملكة لا تُنشأ لها حسابات تلقائياً. وافق بعد المراجعة أو ارفض/احذف الطلب.</p>
    <div className="flex gap-2">{[['pending','بانتظار المراجعة'],['approved','موافق عليها'],['rejected','مرفوضة']].map(([key,label]) => <a key={key} href={`/admin/international-registrations?view=${key}`} className={`rounded-lg border px-3 py-2 text-sm font-bold ${status === key ? 'bg-primary text-white' : 'text-primary'}`}>{label}</a>)}</div>
    {rows.length === 0 ? <p className="py-10 text-center text-muted-foreground">لا توجد طلبات.</p> : rows.map((r) => <div key={String(r.id)} className="card-3d space-y-3 rounded-xl p-4"><div className="flex flex-wrap justify-between gap-2"><b>{r.name} — {r.country}</b><span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString('ar-SA')}</span></div><div className="grid gap-2 text-sm sm:grid-cols-2"><span dir="ltr">{r.phone}</span><span dir="ltr">{r.email}</span></div><p className="rounded-lg bg-muted p-3 text-sm">{r.reason}</p>{r.review_note && <p className="text-sm text-muted-foreground">ملاحظة الإدارة: {r.review_note}</p>}
      {r.status === 'pending' && <div className="grid gap-2 sm:grid-cols-2"><form action={reviewInternationalRegistrationAction} className="space-y-2 rounded-lg border border-emerald-200 p-3"><input type="hidden" name="id" value={String(r.id)} /><input type="hidden" name="decision" value="approve" /><input name="note" maxLength={300} placeholder="ملاحظة داخلية (اختياري)" className="h-9 w-full rounded border px-2 text-sm" /><ConfirmSubmit msg="سيُنشأ الحساب يدوياً دون جلسة أو توثيق جوال. متابعة؟" className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-2 text-sm font-bold text-white"><Check className="h-4 w-4" /> موافقة وإنشاء الحساب</ConfirmSubmit></form><form action={reviewInternationalRegistrationAction} className="space-y-2 rounded-lg border border-red-200 p-3"><input type="hidden" name="id" value={String(r.id)} /><input type="hidden" name="decision" value="reject" /><input name="note" required maxLength={300} placeholder="سبب الرفض" className="h-9 w-full rounded border px-2 text-sm" /><button className="flex items-center gap-1 rounded bg-red-600 px-3 py-2 text-sm font-bold text-white"><XCircle className="h-4 w-4" /> رفض الطلب</button></form></div>}
      {r.status !== 'approved' && <form action={deleteInternationalRegistrationAction}><input type="hidden" name="id" value={String(r.id)} /><ConfirmSubmit msg="حذف طلب التسجيل نهائياً؟" className="flex items-center gap-1 text-sm font-bold text-destructive"><Trash2 className="h-4 w-4" /> حذف الطلب</ConfirmSubmit></form>}
    </div>)}</div>;
}

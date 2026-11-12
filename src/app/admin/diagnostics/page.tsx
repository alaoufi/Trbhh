import { requireAnyAdmin } from '@/lib/roles';
import { Stethoscope, AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';
import { getFeedDiagnostics, clearDefaultPackageAdLifetime } from '@/lib/feed-diagnostics';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تشخيص تغذية الرئيسية' };

async function fixLifetime() {
  'use server';
  await requireAnyAdmin();
  const r = await clearDefaultPackageAdLifetime();
  revalidatePath('/admin/diagnostics');
  revalidatePath('/');
  redirect(`/admin/diagnostics?fixed=${r.ok ? 1 : 0}&msg=${encodeURIComponent(r.message)}`);
}

export default async function FeedDiagnosticsPage({ searchParams }: { searchParams?: Promise<{ fixed?: string; msg?: string }> }) {
  await requireAnyAdmin();
  const sp = (await searchParams) || {};
  const d = await getFeedDiagnostics();
  const v = d.verdict;
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Stethoscope className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-extrabold text-primary">تشخيص تغذية الرئيسية</h1>
      </div>
      <p className="text-sm font-bold text-muted-foreground">
        فحص قراءة-فقط يكشف أين تختفي إعلانات الأعضاء بين قاعدة البيانات وبطاقات الرئيسية —
        يقارن «المؤهّل في القاعدة» بـ«ما يُرجعه كل مصدر فعلياً»، ويحدّد السبب تلقائياً.
      </p>

      {sp.msg && (
        <div className={`rounded-xl border-2 p-3 text-sm font-extrabold ${sp.fixed === '1' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-800'}`}>
          {sp.msg}
        </div>
      )}

      {/* الخلاصة التلقائية */}
      <div className={`rounded-xl border-2 p-4 ${v.ok ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
        <div className="flex items-center gap-2 text-base font-extrabold text-primary">
          {v.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
          {v.title}
        </div>
        <p className="mt-1 text-sm font-bold text-slate-700">{v.detail}</p>
        <p className="mt-1 text-sm text-slate-600">{v.hint}</p>
        {d.lifetime.adDays > 0 && (
          <form action={fixLifetime} className="mt-3">
            <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-[#ff6a1a] px-4 py-2 text-sm font-extrabold text-[#16294a]">
              <Wrench className="h-4 w-4" />
              إصلاح: اجعل مدة بقاء الإعلان للباقة الافتراضية بلا حد (0)
            </button>
          </form>
        )}
      </div>

      {/* العدّادات */}
      <section className="rounded-xl border bg-white p-3">
        <h2 className="mb-2 text-sm font-extrabold text-primary">أرقام قاعدة البيانات</h2>
        <div className="divide-y text-sm">
          {d.counts.map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-slate-600">{c.label}{c.note ? <span className="block text-[11px] text-slate-400">{c.note}</span> : null}</span>
              <span className={`font-extrabold tabular-nums ${c.bad ? 'text-red-600' : 'text-primary'}`}>{c.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* مصادر التغذية الفعلية */}
      <section className="rounded-xl border bg-white p-3">
        <h2 className="mb-2 text-sm font-extrabold text-primary">ما يُرجعه كل مصدر فعلياً (بعد التحويل لبطاقات)</h2>
        <div className="divide-y text-sm">
          {d.sources.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-slate-600">{s.label}{s.error ? <span className="block text-[11px] text-red-500">{s.error}</span> : null}</span>
              <span className={`font-extrabold tabular-nums ${s.bad ? 'text-red-600' : 'text-primary'}`}>{s.count ?? 'خطأ'}</span>
            </div>
          ))}
        </div>
      </section>

      {/* عيّنة */}
      {d.sample.length > 0 && (
        <section className="rounded-xl border bg-white p-3">
          <h2 className="mb-2 text-sm font-extrabold text-primary">عيّنة من المؤهّلين (أحدث ٥)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="text-slate-400"><tr><th className="py-1">#</th><th>state</th><th>status</th><th>store_only</th><th>تاريخ النشر</th></tr></thead>
              <tbody className="tabular-nums">
                {d.sample.map((r) => (
                  <tr key={r.id} className="border-t"><td className="py-1 font-bold">{r.id}</td><td>{r.state}</td><td>{r.status}</td><td>{r.storeOnly ?? '—'}</td><td>{r.createdAt?.slice(0, 10) ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-left text-[11px] text-slate-400">آخر فحص: {new Date(d.generatedAt).toLocaleString('ar')}</p>
    </div>
  );
}

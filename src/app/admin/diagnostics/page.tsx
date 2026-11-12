import { requireAnyAdmin } from '@/lib/roles';
import { Stethoscope, AlertTriangle, CheckCircle2, Wrench, Undo2, Info } from 'lucide-react';
import { runDoctorChecks, applyFix, undoFix, recentFixes, fixTitle, type CheckSeverity } from '@/lib/admin-doctor';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'طبيب المنصة — تشخيص وإصلاح' };

async function doFix(formData: FormData) {
  'use server';
  const session = await requireAnyAdmin();
  const key = String(formData.get('key') || '');
  const r = await applyFix(key, session.uid);
  revalidatePath('/admin/diagnostics');
  revalidatePath('/');
  redirect(`/admin/diagnostics?done=${r.ok ? 1 : 0}&msg=${encodeURIComponent(r.message)}`);
}

async function doUndo(formData: FormData) {
  'use server';
  const session = await requireAnyAdmin();
  const id = Number(formData.get('id') || 0);
  const r = await undoFix(id, session.uid);
  revalidatePath('/admin/diagnostics');
  revalidatePath('/');
  redirect(`/admin/diagnostics?done=${r.ok ? 1 : 0}&msg=${encodeURIComponent(r.message)}`);
}

const SEV: Record<CheckSeverity, { ring: string; chip: string; label: string }> = {
  ok: { ring: 'border-emerald-200 bg-emerald-50', chip: 'bg-emerald-600', label: 'سليم' },
  warn: { ring: 'border-amber-200 bg-amber-50', chip: 'bg-amber-500', label: 'تحذير' },
  crit: { ring: 'border-red-200 bg-red-50', chip: 'bg-red-600', label: 'حرِج' },
};

export default async function DoctorPage({ searchParams }: { searchParams?: Promise<{ done?: string; msg?: string }> }) {
  await requireAnyAdmin();
  const sp = (await searchParams) || {};
  const [{ checks, feed }, log] = await Promise.all([runDoctorChecks(), recentFixes()]);
  const fixable = checks.filter((c) => c.fixKey);

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Stethoscope className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-extrabold text-primary">طبيب المنصة — تشخيص وإصلاح</h1>
      </div>
      <p className="text-sm font-bold text-muted-foreground">
        فحص آلي لصحّة عرض الإعلانات، وإصلاحات ذكية بضغطة. كل إصلاح يغيّر بيانات يأخذ
        <b className="text-primary"> نقطة تراجع</b> فيمكن استرجاعه. العرض العام في تربح غير محدود بمدة الباقة —
        مدة الباقة تخصّ حدّ نشر المعلن فقط.
      </p>

      {sp.msg && (
        <div className={`rounded-xl border-2 p-3 text-sm font-extrabold ${sp.done === '1' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-800'}`}>
          {sp.msg}
        </div>
      )}

      {/* الخلاصة التلقائية */}
      <div className={`rounded-xl border-2 p-4 ${feed.verdict.ok ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
        <div className="flex items-center gap-2 text-base font-extrabold text-primary">
          {feed.verdict.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
          {feed.verdict.title}
        </div>
        <p className="mt-1 text-sm font-bold text-slate-700">{feed.verdict.detail}</p>
        <p className="mt-1 text-sm text-slate-600">{feed.verdict.hint}</p>
      </div>

      {/* الفحوص */}
      <section className="space-y-2">
        <h2 className="text-sm font-extrabold text-primary">الفحص الشامل</h2>
        {checks.map((c) => (
          <div key={c.id} className={`rounded-xl border p-3 ${SEV[c.severity].ring}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-primary">{c.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white ${SEV[c.severity].chip}`}>{SEV[c.severity].label}</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{c.detail}</p>
            {c.fixKey && (
              <form action={doFix} className="mt-2">
                <input type="hidden" name="key" value={c.fixKey} />
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-[#ff6a1a] px-3 py-1.5 text-xs font-extrabold text-[#16294a]">
                  <Wrench className="h-3.5 w-3.5" /> إصلاح: {fixTitle(c.fixKey)}
                </button>
              </form>
            )}
          </div>
        ))}
      </section>

      {/* إصلاحات يدوية إضافية دائمة */}
      <section className="rounded-xl border bg-white p-3">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-primary"><Wrench className="h-4 w-4" /> إصلاحات سريعة</h2>
        <div className="flex flex-wrap gap-2">
          {['cache_clear', 'store_only_null', 'default_pkg_adlifetime'].map((k) => (
            <form key={k} action={doFix}>
              <input type="hidden" name="key" value={k} />
              <button type="submit" className="rounded-lg border border-primary/30 bg-secondary/40 px-3 py-1.5 text-xs font-bold text-primary hover:bg-secondary">{fixTitle(k)}</button>
            </form>
          ))}
        </div>
        {fixable.length === 0 && <p className="mt-2 text-xs text-emerald-700">لا توجد أعطال تحتاج إصلاحاً الآن — كل الفحوص سليمة ✓</p>}
      </section>

      {/* الأرقام */}
      <section className="rounded-xl border bg-white p-3">
        <h2 className="mb-2 text-sm font-extrabold text-primary">أرقام قاعدة البيانات</h2>
        <div className="divide-y text-sm">
          {feed.counts.map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-slate-600">{c.label}{c.note ? <span className="block text-[11px] text-slate-400">{c.note}</span> : null}</span>
              <span className={`font-extrabold tabular-nums ${c.bad ? 'text-red-600' : 'text-primary'}`}>{c.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* مصادر التغذية */}
      <section className="rounded-xl border bg-white p-3">
        <h2 className="mb-2 text-sm font-extrabold text-primary">ما يُرجعه كل مصدر فعلياً</h2>
        <div className="divide-y text-sm">
          {feed.sources.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-slate-600">{s.label}{s.error ? <span className="block text-[11px] text-red-500">{s.error}</span> : null}</span>
              <span className={`font-extrabold tabular-nums ${s.bad ? 'text-red-600' : 'text-primary'}`}>{s.count ?? 'خطأ'}</span>
            </div>
          ))}
        </div>
      </section>

      {/* سجل الإصلاحات والتراجع */}
      <section className="rounded-xl border bg-white p-3">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-primary"><Undo2 className="h-4 w-4" /> سجل الإصلاحات ونقاط التراجع</h2>
        {log.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-slate-500"><Info className="h-3.5 w-3.5" /> لم يُنفّذ أي إصلاح بعد.</p>
        ) : (
          <div className="divide-y text-sm">
            {log.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <span className="block truncate font-bold text-primary">{e.title}</span>
                  <span className="block text-[11px] text-slate-400">{new Date(e.createdAt).toLocaleString('ar')} · تأثّر {e.affected}{e.undoneAt ? ' · تمّ التراجع' : ''}</span>
                </div>
                {e.reversible && !e.undoneAt && (
                  <form action={doUndo}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"><Undo2 className="h-3.5 w-3.5" /> تراجع</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-left text-[11px] text-slate-400">آخر فحص: {new Date(feed.generatedAt).toLocaleString('ar')}</p>
    </div>
  );
}

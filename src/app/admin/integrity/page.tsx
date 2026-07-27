import { ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { getIntegrityReport, type IntegrityFinding } from '@/lib/integrity';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'نزاهة الهويات' };

const SEV: Record<IntegrityFinding['severity'], { ring: string; chip: string; label: string }> = {
  high: { ring: 'border-red-300 bg-red-50', chip: 'bg-red-600', label: 'حرِج' },
  medium: { ring: 'border-amber-300 bg-amber-50', chip: 'bg-amber-500', label: 'متوسط' },
  low: { ring: 'border-slate-300 bg-slate-50', chip: 'bg-slate-500', label: 'منخفض' },
};

export default async function IntegrityPage() {
  await requireAction('users', 'view');
  const report = await getIntegrityReport();
  const issues = report.filter((f) => f.count > 0);
  const clean = report.filter((f) => f.count === 0);
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-extrabold text-primary">نزاهة الهويات</h1>
      </div>
      <p className="text-sm font-bold text-muted-foreground">
        كشفٌ قراءة-فقط لأي <b className="text-primary">ازدواجية</b> أو <b className="text-primary">اختلاط/تداخل</b> سابق بين الحسابات والمتاجر والهويات.
        لا يُعدّل هذا التقرير أي بيانات — الغاية أن تروا الواقع قبل أي إصلاح. المنع المستقبلي مُفعَّل (لا تكرار معرّفات، والدمج مُعطَّل — التوحيد بالربط المستقل فقط).
      </p>

      {issues.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-sm font-extrabold text-emerald-800">
          <CheckCircle2 className="h-5 w-5" /> لا يوجد أي تداخل أو ازدواجية — كل الهويات مستقلة ونظيفة.
        </div>
      ) : (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-extrabold text-amber-900">
          <AlertTriangle className="mb-1 inline h-4 w-4" /> رُصد {issues.length} نوع تداخل/ازدواجية. راجِعوها ثم أخبِروني بما تريدون إصلاحه — الإصلاح يُنفَّذ بحذر لكل حالة (فكّ دمج / إزالة تكرار / إعادة تسمية) بعد موافقتكم، لأنه لا رجعة فيه.
        </div>
      )}

      {issues.map((f) => {
        const s = SEV[f.severity];
        return (
          <section key={f.key} className={`overflow-hidden rounded-2xl border-2 ${s.ring} shadow-sm`}>
            <div className="flex items-center justify-between gap-2 p-3">
              <h2 className="font-extrabold text-foreground">{f.label}</h2>
              <div className="flex items-center gap-2">
                <span className={`rounded-full ${s.chip} px-2 py-0.5 text-[11px] font-bold text-white`}>{s.label}</span>
                <span className="rounded-full bg-foreground/85 px-2.5 py-0.5 text-sm font-extrabold text-white">{f.count}</span>
              </div>
            </div>
            <div className="space-y-2 border-t border-black/5 bg-white/60 p-3">
              <p className="text-xs font-bold text-muted-foreground">{f.hint}</p>
              {f.samples.length > 0 && (
                <ul className="space-y-1">
                  {f.samples.map((sample, i) => (
                    <li key={i} className="rounded-lg bg-muted px-2.5 py-1 text-xs font-bold text-foreground">{sample}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })}

      {clean.length > 0 && (
        <section className="rounded-2xl border-2 border-emerald-200 bg-white p-3">
          <h3 className="mb-2 text-xs font-extrabold text-emerald-700">فحوص نظيفة ✅</h3>
          <div className="flex flex-wrap gap-2">
            {clean.map((f) => (
              <span key={f.key} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">{f.label}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

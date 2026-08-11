import { CreditCard, CheckCircle2, Circle, ExternalLink, KeyRound, ShieldCheck, Clock } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { savePaymentSettingsAction, saveProviderCredsAction, saveTopupMethodSettingsAction } from '../actions';
import { PROVIDER_META, providerMeta, getPaymentConfig, getProviderCreds, isProviderConfigured, getEnabledMethods, getTopupMethodAvailability, alrajhiConfigReport, CONTROLLABLE_METHODS, METHOD_LABEL_AR } from '@/lib/payments';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'وسائل الدفع الإلكتروني' };

const METHOD_LABEL = METHOD_LABEL_AR;

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ saved?: string; alrajhi?: string }> }) {
  await requireAction('users', 'edit');
  const { saved, alrajhi } = await searchParams;
  const cfg = await getPaymentConfig();
  const enabledMethods = await getEnabledMethods();
  const activeSupported = cfg.provider ? (providerMeta(cfg.provider)?.methods ?? []) : [];
  const [topupMethods, alrajhiReport] = await Promise.all([getTopupMethodAvailability(), Promise.resolve(alrajhiConfigReport())]);

  // لكل مزوّد: هل مُهيّأ؟ وأي حقول سرّية مخزَّنة (نمرّر منطقاً فقط — لا نكشف القيم).
  const provState = await Promise.all(
    PROVIDER_META.map(async (m) => {
      const creds = await getProviderCreds(m.id);
      const configured = await isProviderConfigured(m.id);
      const filled: Record<string, boolean> = {};
      for (const c of m.creds) filled[c.key] = (creds[c.key] || '').length > 0;
      return { id: m.id, configured, filled };
    }),
  );
  const stateOf = (id: string) => provState.find((p) => p.id === id)!;
  const readyMetas = PROVIDER_META.filter((m) => m.ready);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <CreditCard className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">وسائل الدفع الإلكتروني</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        تفعيل شحن الرصيد والمدفوعات مباشرةً عبر بوابة دفع (مدى/بطاقات/Apple Pay/STC Pay). المفاتيح تُحفظ في إعدادات
        الخادم (خارج المستودع) وتُقنَّع هنا. اربط شركة واحدة فعّالة الآن، ويمكن تبديلها لاحقاً بلا لمس الكود.
      </p>

      {saved && <div className="rounded-lg border-2 border-emerald-400 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">✅ حُفظت الإعدادات.</div>}
      {alrajhi === 'missing' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900">لا يمكن تفعيل الدفع الإلكتروني قبل اكتمال إعدادات الراجحي واختبار Sandbox.</div>}

      <form action={saveTopupMethodSettingsAction} className="space-y-3 rounded-2xl border-2 border-primary/25 bg-card p-4">
        <h2 className="flex items-center gap-2 font-bold text-primary"><ShieldCheck className="h-5 w-5" /> تفعيل وسائل شحن الرصيد</h2>
        <label className="flex items-start gap-2 text-sm font-bold"><input type="checkbox" name="electronicEnabled" defaultChecked={topupMethods.electronic} disabled={!alrajhiReport.ready} className="mt-0.5 h-4 w-4 accent-primary disabled:opacity-50" /><span>الدفع الإلكتروني عبر مصرف الراجحي {!alrajhiReport.ready && <small className="block font-medium text-amber-700">موقوف حتى تكتمل حقول البيئة ويُنفذ اختبار المصرف.</small>}</span></label>
        <label className="flex items-start gap-2 text-sm font-bold"><input type="checkbox" name="transferEnabled" defaultChecked={topupMethods.transfer} className="mt-0.5 h-4 w-4 accent-primary" /><span>التحويل البنكي وإرفاق الإيصال <small className="block font-medium text-muted-foreground">مستقل عن الدفع الإلكتروني.</small></span></label>
        <div className="rounded-xl bg-primary/5 p-3 text-xs"><b className="text-primary">حالة حقول الراجحي ({alrajhiReport.environment}):</b><div className="mt-2 flex flex-wrap gap-1.5">{alrajhiReport.fields.map((field) => <span key={field.key} className={`rounded-full px-2 py-1 font-bold ${field.present ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{field.present ? '✓' : '!' } {field.key}</span>)}</div><p className="mt-2 text-muted-foreground">القيم لا تظهر هنا ولا تُحفظ في قاعدة البيانات. اختبار الاتصال الحقيقي يُتاح بعد استلام عقد API الرسمي من المصرف.</p></div>
        <ConfirmSubmit msg="حفظ تفعيل وسائل الشحن؟" className="btn-3d rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">حفظ التفعيل والإيقاف</ConfirmSubmit>
      </form>

      {/* الإعدادات العامة */}
      <form action={savePaymentSettingsAction} className="space-y-3 rounded-2xl border border-primary/20 bg-card p-4">
        <h2 className="flex items-center gap-2 font-bold text-primary"><ShieldCheck className="h-5 w-5" /> الإعداد العام</h2>
        <label className="flex items-start gap-2 text-sm font-medium">
          <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} className="mt-0.5 h-4 w-4 accent-primary" />
          <span>تفعيل الدفع الإلكتروني (يظهر للأعضاء زرّ «ادفع أونلاين» في المحفظة عند اكتمال تهيئة المزوّد)</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-muted-foreground">المزوّد الفعّال</span>
            <select name="provider" defaultValue={cfg.provider} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm">
              <option value="">— بلا —</option>
              {readyMetas.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.nameEn}){stateOf(m.id).configured ? '' : ' — يحتاج مفاتيح'}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-muted-foreground">وضع التشغيل</span>
            <select name="mode" defaultValue={cfg.mode} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm">
              <option value="test">تجريبي (Test) — مفاتيح اختبار، بلا أموال حقيقية</option>
              <option value="live">مباشر (Live) — أموال حقيقية</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-muted-foreground">أقل مبلغ شحن (ر.س)</span>
            <input name="min" type="number" min={1} defaultValue={cfg.min} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-muted-foreground">أعلى مبلغ شحن (ر.س)</span>
            <input name="max" type="number" min={1} defaultValue={cfg.max} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm" />
          </label>
        </div>

        {/* التحكّم بوسائل الدفع المسموح بها (لتفاوت الرسوم) */}
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
          <div className="mb-2 text-sm font-bold text-foreground">وسائل الدفع المسموح بها</div>
          <p className="mb-2 text-xs text-muted-foreground">فعّل ما تريده فقط — تُعطَّل الوسائل ذات الرسوم الأعلى بإلغاء تحديدها فلا تظهر للعضو ولا في صفحة الدفع.</p>
          <div className="flex flex-wrap gap-2">
            {CONTROLLABLE_METHODS.map((m) => {
              const supported = !cfg.provider || activeSupported.includes(m);
              return (
                <label key={m} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold ${supported ? 'border-primary/25 bg-white' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                  <input type="checkbox" name={`method_${m}`} defaultChecked={enabledMethods.includes(m)} disabled={!supported} className="h-4 w-4 accent-primary" />
                  {METHOD_LABEL[m] || m}
                  {!supported && <span className="text-[10px] font-medium">(لا يدعمها المزوّد الحالي)</span>}
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-amber-700">⚠ ملاحظة: بعض المزوّدين (مثل ميسّر وتاب) يوحّدون شبكات البطاقات (مدى/فيزا/ماستركارد) في خيار «بطاقة» واحد على صفحة الدفع؛ الفصل الدقيق بين شبكات البطاقات (للرسوم) يُضبط من لوحة المزوّد نفسه. أمّا PayTabs فيفصل مدى عن البطاقات هنا مباشرةً. Apple Pay وSTC Pay يُفعَّلان/يُعطَّلان بدقّة لدى الجميع.</p>
        </div>

        <ConfirmSubmit msg="حفظ إعدادات الدفع العامة؟" className="btn-3d rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">حفظ الإعداد العام</ConfirmSubmit>
      </form>

      {/* مفاتيح المزوّدين الجاهزين */}
      <div className="space-y-3">
        <h2 className="font-bold text-primary">مفاتيح المزوّدين الجاهزين</h2>
        {readyMetas.map((m) => {
          const st = stateOf(m.id);
          const active = cfg.provider === m.id;
          return (
            <form key={m.id} action={saveProviderCredsAction} className={`space-y-3 rounded-2xl border p-4 ${active ? 'border-emerald-400 bg-emerald-50/40' : 'border-primary/15 bg-card'}`}>
              <input type="hidden" name="provider" value={m.id} />
              <div className="flex flex-wrap items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                <b className="text-foreground">{m.name}</b>
                <span className="text-xs text-muted-foreground" dir="ltr">{m.nameEn}</span>
                {st.configured
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> مُهيّأ</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700"><Circle className="h-3 w-3" /> يحتاج مفاتيح</span>}
                {active && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">الفعّال الآن</span>}
                <a href={m.docsUrl} target="_blank" rel="noopener noreferrer" className="mr-auto inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">التوثيق <ExternalLink className="h-3 w-3" /></a>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.methods.map((mm) => <span key={mm} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-foreground/70">{METHOD_LABEL[mm] || mm}</span>)}
              </div>
              <p className="rounded-lg bg-primary/5 p-2 text-xs text-foreground/70">{m.notes}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {m.creds.map((c) => (
                  <label key={c.key} className="text-sm">
                    <span className="mb-1 block font-medium text-muted-foreground">{c.label}{c.secret && ' 🔒'}</span>
                    <input
                      name={c.key}
                      type={c.secret ? 'password' : 'text'}
                      autoComplete="off"
                      dir="ltr"
                      placeholder={c.secret && st.filled[c.key] ? '•••••••• (محفوظ — اتركه فارغاً للإبقاء عليه)' : (c.placeholder || '')}
                      className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm"
                    />
                    {c.hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{c.hint}</span>}
                  </label>
                ))}
              </div>
              <ConfirmSubmit msg={`حفظ مفاتيح ${m.name}؟`} className="btn-3d rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">حفظ مفاتيح {m.name}</ConfirmSubmit>
            </form>
          );
        })}
      </div>

      {/* كتالوج: ما تحتاجه كل شركة (للتفاوض والتخطيط) */}
      <div className="space-y-3">
        <h2 className="font-bold text-primary">دليل الشركات — ما تحتاجه كل جهة</h2>
        <p className="text-sm text-muted-foreground">مرجع للتفاوض: كل مزوّد ووسائله والحقول المطلوبة منه. «قيد التجهيز» = مُدرَج بمتطلّباته ويُفعَّل عند اكتمال ربطه.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDER_META.map((m) => (
            <div key={m.id} className="rounded-2xl border border-primary/15 bg-card p-3.5 text-sm">
              <div className="flex items-center gap-2">
                <b className="text-foreground">{m.name}</b>
                <span className="text-xs text-muted-foreground" dir="ltr">{m.nameEn}</span>
                {m.ready
                  ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">جاهز</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600"><Clock className="h-3 w-3" /> قيد التجهيز</span>}
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">{m.kind === 'bnpl' ? 'تقسيط' : 'بطاقات'}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {m.methods.map((mm) => <span key={mm} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-foreground/60">{METHOD_LABEL[mm] || mm}</span>)}
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">المطلوب: {m.creds.map((c) => c.label).join(' · ')}</div>
              <a href={m.docsUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">التوثيق <ExternalLink className="h-3 w-3" /></a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

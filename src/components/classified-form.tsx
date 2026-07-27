'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { Phone, MessageCircle, ExternalLink, Sparkles, AlignRight, AlignCenter, ArrowUpToLine, ArrowDownToLine, AlignVerticalJustifyCenter, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CLASSIFIED_THEMES, CLASSIFIED_TEMPLATES, POS_CLASS, SIZE_TITLE, SIZE_BODY, SIZE_TITLE_POSTER, SIZE_BODY_POSTER,
  type Pos, type Align, type Size, type Pattern, type Accent, type Template,
} from '@/lib/classified-theme';
import { ClassifiedDecor } from '@/components/classified-decor';
import { SubmitOverlay } from '@/components/submit-overlay';
import { compressInputFiles } from '@/lib/image-compress';

function Submit({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <Button size="lg" className="w-full gap-2" disabled={pending || disabled}><Sparkles className="h-4 w-4" /> {pending ? 'جارٍ التصميم والنشر...' : label}</Button>;
}

export type ClassifiedInitial = {
  id?: number; title?: string | null; body?: string | null; phone?: string | null; whatsapp?: string | null;
  link?: string | null; image?: string | null;
  theme?: number; pos?: Pos; align?: Align; size?: Size; bold?: boolean; pattern?: Pattern; accent?: Accent;
  layout?: 'auto' | 'manual';
};

export function ClassifiedForm({ action, error, initial, submitLabel, needPrice, needBal, gapWait, dupLeft, durations, balance, allowSchedule, scheduleMaxDays = 30 }: {
  action: (fd: FormData) => void | Promise<void>; error?: string; initial?: ClassifiedInitial; submitLabel?: string; needPrice?: string; needBal?: string; gapWait?: string; dupLeft?: string;
  durations?: { w2: number; m1: number; y1: number } | null;
  balance?: number;
  allowSchedule?: boolean;
  scheduleMaxDays?: number;
}) {
  const hasBalance = typeof balance === 'number';
  const durationOptions = durations
    ? ([['w2', 'أسبوعان', durations.w2], ['m1', 'شهر', durations.m1], ['y1', 'سنة', durations.y1]] as const)
    : null;
  const affordableOptions = durationOptions ? durationOptions.filter(([, , price]) => !hasBalance || price <= (balance as number)) : [];
  const noneAffordable = !!durationOptions && hasBalance && affordableOptions.length === 0;
  const [duration, setDuration] = useState<string | null>(() => affordableOptions[0]?.[0] ?? null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? '');
  const [link, setLink] = useState(initial?.link ?? '');
  const [imgUrl, setImgUrl] = useState<string | null>(initial?.image ?? null);

  // style state (driven by the chosen template, tweakable via advanced controls)
  const [tplId, setTplId] = useState(CLASSIFIED_TEMPLATES[0].id);
  const [theme, setTheme] = useState(initial?.theme ?? 0);
  const [pos, setPos] = useState<Pos>(initial?.pos ?? 'bottom');
  const [align, setAlign] = useState<Align>(initial?.align ?? 'right');
  const [size, setSize] = useState<Size>(initial?.size ?? 'md');
  const [bold, setBold] = useState(initial?.bold ?? true);
  const [pattern, setPattern] = useState<Pattern>(initial?.pattern ?? 'none');
  const [accent, setAccent] = useState<Accent>(initial?.accent ?? 'none');
  const [layout, setLayout] = useState<'auto' | 'manual'>(initial?.layout ?? 'auto');

  function applyTemplate(t: Template) {
    setTplId(t.id); setTheme(t.theme); setPos(t.pos); setAlign(t.align);
    setSize(t.size); setBold(t.bold); setPattern(t.pattern); setAccent(t.accent);
  }

  const field = 'h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40';
  const t = CLASSIFIED_THEMES[theme];
  const dark = t.text === 'dark' && !imgUrl;
  const wa = whatsapp.replace(/[^\d]/g, '');

  const [imgBusy, setImgBusy] = useState(false);
  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    if (!input.files?.length) { setImgUrl(null); return; }
    setImgBusy(true);
    const small = await compressInputFiles(input); // shrink before upload (fast on slow نت)
    setImgUrl(small ? URL.createObjectURL(small) : null);
    setImgBusy(false);
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* preview + template library */}
      <div className={`order-2 space-y-4 md:order-2 ${noneAffordable ? 'pointer-events-none select-none opacity-40' : ''}`}>
        <div>
          <p className="mb-2 text-center text-xs text-muted-foreground">معاينة مباشرة</p>
          <div className="mx-auto max-w-[260px]">
            <div className="card-3d overflow-hidden rounded-2xl">
              <div
                className={`relative flex aspect-square flex-col overflow-hidden ${!imgUrl ? 'justify-center' : imgUrl && layout === 'auto' ? 'justify-end' : POS_CLASS[pos]} ${dark ? 'text-slate-900' : 'text-white'}`}
                style={imgUrl ? undefined : { backgroundImage: `linear-gradient(150deg, ${t.from}, ${t.to})` }}
              >
                {imgUrl && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                  </>
                )}
                <ClassifiedDecor pattern={pattern} accent={accent} dark={dark} />
                {link && <span className="absolute right-2 top-2 z-10 rounded-full bg-white/25 p-1 backdrop-blur"><ExternalLink className="h-3.5 w-3.5" /></span>}
                {imgUrl && layout === 'auto' && (title || body) ? (
                  <div className="relative z-10 p-2">
                    <div className="rounded-xl bg-black/45 p-2.5 text-center backdrop-blur-sm">
                      {title && <h3 className={`line-clamp-2 leading-tight drop-shadow ${SIZE_TITLE[size]} ${bold ? 'font-extrabold' : 'font-semibold'}`}>{title}</h3>}
                      {body && <p className={`mt-0.5 line-clamp-2 leading-snug text-white/90 drop-shadow ${SIZE_BODY[size]}`}>{body}</p>}
                    </div>
                  </div>
                ) : (
                  <div className={`relative z-10 space-y-1.5 p-4 ${!imgUrl ? 'text-center' : align === 'center' ? 'text-center' : 'text-right'}`}>
                    {title && <h3 className={`line-clamp-4 leading-tight drop-shadow ${(!imgUrl ? SIZE_TITLE_POSTER : SIZE_TITLE)[size]} ${bold ? 'font-extrabold' : 'font-medium'}`}>{title}</h3>}
                    {body && <p className={`line-clamp-3 leading-snug drop-shadow ${(!imgUrl ? SIZE_BODY_POSTER : SIZE_BODY)[size]} ${dark ? 'text-slate-700' : 'text-white/90'}`}>{body}</p>}
                    {!title && !body && !imgUrl && <p className="text-sm opacity-80">اكتب نصاً أو أضف صورة…</p>}
                  </div>
                )}
              </div>
              {(wa || phone) && (
                <div className="flex gap-1.5 p-1.5">
                  {wa && <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] py-2.5 text-sm font-bold text-white"><MessageCircle className="h-5 w-5" /> واتساب</span>}
                  {phone && <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white"><Phone className="h-5 w-5" /> اتصال</span>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* تخصيص الشكل — بارز تحت الصندوق مباشرة، والتعديل يظهر فوراً في المعاينة بالأعلى */}
        <div className="space-y-3 rounded-xl border-2 border-primary/25 bg-accent/30 p-3">
          <p className="text-sm font-extrabold text-primary">🎨 تخصيص الشكل <span className="text-xs font-bold text-muted-foreground">— التعديل يظهر فوراً في المعاينة بالأعلى</span></p>
          {!imgUrl && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground">لون خلفية التصميم</p>
              <div className="flex flex-wrap gap-2">
                {CLASSIFIED_THEMES.map((th, i) => (
                  <button key={i} type="button" onClick={() => setTheme(i)} aria-label={`لون ${i + 1}`}
                    className={`h-8 w-8 rounded-full ring-2 ${theme === i ? 'ring-primary ring-offset-2' : 'ring-transparent'}`}
                    style={{ backgroundImage: `linear-gradient(150deg, ${th.from}, ${th.to})` }} />
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1 text-xs font-bold text-foreground">مكان النص داخل التصميم (أعلى / وسط / أسفل)</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([['top', 'أعلى', ArrowUpToLine], ['center', 'وسط', AlignVerticalJustifyCenter], ['bottom', 'أسفل', ArrowDownToLine]] as const).map(([p, label, Icon]) => (
                <button key={p} type="button" onClick={() => setPos(p)} className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-xs font-bold ${pos === p ? 'border-primary bg-primary text-white' : 'border-primary/20 bg-white'}`}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs font-bold text-foreground">محاذاة النص</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => setAlign('right')} className={`flex items-center justify-center gap-1 rounded-lg border-2 p-2 text-xs font-bold ${align === 'right' ? 'border-primary bg-primary text-white' : 'border-primary/20 bg-white'}`}><AlignRight className="h-4 w-4" /> يمين</button>
                <button type="button" onClick={() => setAlign('center')} className={`flex items-center justify-center gap-1 rounded-lg border-2 p-2 text-xs font-bold ${align === 'center' ? 'border-primary bg-primary text-white' : 'border-primary/20 bg-white'}`}><AlignCenter className="h-4 w-4" /> وسط</button>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold text-foreground">حجم الخط</p>
              <div className="grid grid-cols-3 gap-1">
                {(['sm', 'md', 'lg'] as Size[]).map((s) => (
                  <button key={s} type="button" onClick={() => setSize(s)} className={`rounded-lg border-2 py-1.5 text-xs font-bold ${size === s ? 'border-primary bg-primary text-white' : 'border-primary/20 bg-white'}`}>{s === 'sm' ? 'صغير' : s === 'md' ? 'متوسط' : 'كبير'}</button>
                ))}
              </div>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold"><input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} className="h-4 w-4 accent-primary" /> خط غامق للنص</label>
        </div>

        {/* template library */}
        <div>
          <p className="mb-2 text-sm font-semibold text-primary">اختر الشكل ({CLASSIFIED_TEMPLATES.length} نموذج)</p>
          <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto rounded-xl border border-primary/15 bg-accent/20 p-2 sm:grid-cols-5">
            {CLASSIFIED_TEMPLATES.map((tp) => {
              const th = CLASSIFIED_THEMES[tp.theme];
              const d = th.text === 'dark';
              return (
                <button key={tp.id} type="button" onClick={() => applyTemplate(tp)} aria-label={tp.name}
                  className={`relative overflow-hidden rounded-md ring-2 ${tplId === tp.id ? 'ring-primary' : 'ring-transparent'}`}>
                  <div className={`relative flex aspect-square ${POS_CLASS[tp.pos]} overflow-hidden`} style={{ backgroundImage: `linear-gradient(150deg, ${th.from}, ${th.to})` }}>
                    <ClassifiedDecor pattern={tp.pattern} accent={tp.accent} dark={d} />
                    <div className={`relative z-10 w-full p-1 ${tp.align === 'center' ? 'text-center' : 'text-right'}`}>
                      <span className={`inline-block h-1.5 rounded ${d ? 'bg-black/50' : 'bg-white/80'}`} style={{ width: '70%' }} />
                    </div>
                  </div>
                  {tplId === tp.id && <span className="absolute inset-0 grid place-items-center bg-primary/25"><Check className="h-5 w-5 text-white drop-shadow" /></span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* form */}
      <form action={action} className="order-1 space-y-4 md:order-1">
        <SubmitOverlay label="جارٍ التصميم والنشر…" />
        {initial?.id && <input type="hidden" name="id" value={initial.id} />}
        {error === 'content' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">أضف صورة أو نصّاً على الأقل.</div>}
        {error === 'contact' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">أضف رقم جوال أو واتساب على الأقل.</div>}
        {error === 'save' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">تعذّر حفظ الإعلان. حاول مرة أخرى، وإذا تكرّر أخبرنا.</div>}
        {error === 'flood' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">⏳ أنت تنشر بسرعة كبيرة (إغراق). الرجاء الانتظار{gapWait ? ` نحو ${gapWait} ثانية` : ' قليلاً'} قبل نشر إعلان مبوّب آخر.</div>}
        {error === 'blocked' && <div className="rounded-lg border-2 border-red-500 bg-red-100 p-3 text-sm font-bold text-red-900">🚫 رُفض هذا الإعلان لاحتوائه على محتوى مخالف (غير أخلاقي / مخدرات / أمني / سياسي / جمع تبرعات غير مرخّص). النشر ممنوع، وقد يُحظر الحساب فوراً عند المحتوى غير الأخلاقي.</div>}
        {error === 'toomany' && <div className="rounded-lg border-2 border-red-500 bg-red-100 p-3 text-sm font-bold text-red-900">🚫 لم يُنشر إعلانك لاحتوائه كلماتٍ مخالفةً كثيرة تجاوزت الحد المسموح. عدّل المحتوى وأزِل الكلمات المخالفة ثم أعد النشر.</div>}
        {error === 'image' && <div className="rounded-lg border-2 border-red-500 bg-red-100 p-3 text-sm font-bold text-red-900">🚫 رُفضت الصورة لاشتباه المحتوى بأنه غير لائق. الرجاء رفع صورة مناسبة فقط.</div>}
        {error === 'window' && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">انتهت المدة المسموح بها لتعديل هذا الإعلان حسب إعدادات الموقع. للتعديل بعدها تواصل مع الإدارة.</div>}
        {error === 'duplicate' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">⚠️ هذا الإعلان المبوّب مطابق لإعلان سابق لك (في المحتوى أو الصورة أو الخلفية). لا يُسمح بتكرار نفس الإعلان — عدّل المحتوى أو الصورة لنشره{dupLeft ? ` (إنذار: ${dupLeft} محاولة متبقية قبل الحظر)` : ''}.</div>}
        {error === 'crossdup' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">⚠️ هذا المحتوى مطابق لإعلان مبوّب لعضو آخر — لا يُسمح بنشر محتوى ليس ملكك{dupLeft ? ` (إنذار: ${dupLeft} محاولة متبقية قبل الحظر)` : ''}.</div>}
        {error === 'banned' && <div className="rounded-lg border-2 border-red-500 bg-red-100 p-3 text-sm font-bold text-red-900">🚫 تم حظر حسابك بعد تكرار نشر نفس الإعلان المبوّب.</div>}
        {error === 'needdup' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">🔁 هذا المبوّب مكرّر. لنشره عدّة مرّات اشترِ <b>باقة تكرار</b> (مكرّر 3/5) من <Link href="/account/wallet" className="underline">محفظتي</Link> ثم أعد النشر.</div>}
        {error === 'needcredit' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 <b>اشحن رصيدك</b> لإتمام النشر{needPrice ? <> — التكلفة <b>{needPrice} ر.س</b></> : ''}{needBal !== undefined ? <> ورصيدك <b>{needBal} ر.س</b></> : ''}. راجع <Link href="/account/wallet" className="underline">محفظتي</Link> أو تواصل مع الإدارة للشحن.</div>}

        {noneAffordable && (
          <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 text-center">
            <p className="mb-1 font-extrabold text-red-800">💳 رصيدك الحالي لا يكفي لنشر إعلان مبوّب</p>
            <p className="mb-3 text-sm text-red-700">اشحن رصيدك أولاً، ثم صمّم إعلانك وانشره.</p>
            <Link href="/account/wallet" className="inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white">اشحن رصيدي الآن</Link>
          </div>
        )}

        <fieldset disabled={noneAffordable} className={noneAffordable ? 'space-y-4 border-0 p-0 opacity-40' : 'space-y-4 border-0 p-0'}>
          {durationOptions && (
            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-3">
              {error === 'duration' && <div className="mb-2 text-sm font-bold text-red-700">اختر مدّة النشر.</div>}
              <div className="mb-2 text-sm font-bold text-primary">مدّة نشر الإعلان المبوّب</div>
              <div className="grid grid-cols-3 gap-2">
                {durationOptions.map(([val, label, price]) => {
                  const affordable = !hasBalance || price <= (balance as number);
                  return (
                    <label key={val} className={`flex flex-col items-center gap-0.5 rounded-lg border-2 border-border bg-white p-2 text-center text-xs has-[:checked]:border-primary has-[:checked]:bg-primary/5 ${affordable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}>
                      <input type="radio" name="duration" value={val} checked={duration === val} disabled={!affordable} onChange={() => setDuration(val)} required className="accent-primary" />
                      <span className="font-bold">{label}</span>
                      <span className={`font-extrabold ${affordable ? 'text-primary' : 'text-red-500'}`}>{price} ر.س</span>
                    </label>
                  );
                })}
              </div>
              {hasBalance && !noneAffordable && affordableOptions.length < durationOptions.length && (
                <p className="mt-2 text-xs font-bold text-amber-700">بعض المدد غير متاحة برصيدك الحالي — اشحن رصيدك من <Link href="/account/wallet" className="underline">محفظتي</Link> لإتاحتها.</p>
              )}
            </div>
          )}

          {/* hidden style fields */}
          <input type="hidden" name="theme" value={theme} />
          <input type="hidden" name="pos" value={pos} />
          <input type="hidden" name="align" value={align} />
          <input type="hidden" name="size" value={size} />
          <input type="hidden" name="pattern" value={pattern} />
          <input type="hidden" name="accent" value={accent} />
          <input type="hidden" name="layout" value={layout} />
          {bold && <input type="hidden" name="bold" value="1" />}

          <div>
            <label className="mb-1 block text-sm font-medium">العنوان (اختياري)</label>
            <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} className={field} placeholder="مثال: عروض رمضان" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">النص <span className="text-muted-foreground">(نص أو صورة إجباري)</span></label>
            <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} className="w-full rounded-lg border border-primary/30 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" placeholder="اكتب نص إعلانك…" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">الصورة (اختياري إن كتبت نصاً)</label>
            <input name="image" type="file" accept="image/*" onChange={onImage} className="w-full rounded-lg border border-primary/30 bg-white p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1" />
            {imgBusy && <p className="mt-1 text-xs text-primary">⏳ جارٍ تجهيز الصورة وتصغيرها للرفع السريع…</p>}
            {!imgBusy && imgUrl && <p className="mt-1 text-xs text-green-600">✓ الصورة جاهزة</p>}
            {initial?.id && initial?.image && <p className="mt-1 text-xs text-muted-foreground">اترك الحقل فارغاً للإبقاء على الصورة الحالية.</p>}
          </div>

          {/* صورة + نص: اختر ترتيباً تلقائياً جميلاً أو تحكّم في مكان النص */}
          {imgUrl && (title || body) && (
            <div className="rounded-lg border border-primary/20 bg-accent/30 p-3">
              <p className="mb-2 text-sm font-semibold text-primary">ترتيب النص فوق الصورة</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setLayout('auto')} className={`flex-1 rounded-lg border p-2 text-xs font-medium ${layout === 'auto' ? 'border-primary bg-accent text-primary' : 'border-primary/20'}`}>
                  ✨ ترتيب تلقائي جميل
                </button>
                <button type="button" onClick={() => setLayout('manual')} className={`flex-1 rounded-lg border p-2 text-xs font-medium ${layout === 'manual' ? 'border-primary bg-accent text-primary' : 'border-primary/20'}`}>
                  🎯 أتحكّم في مكان النص
                </button>
              </div>
              {layout === 'manual' && <p className="mt-2 text-xs text-muted-foreground">اضبط مكان النص ومحاذاته من «تخصيص الشكل» بجانب المعاينة بالأعلى.</p>}
            </div>
          )}

          <div className="rounded-lg border border-primary/20 bg-accent/40 p-3">
            <p className="mb-2 text-sm font-semibold text-primary">وسيلة التواصل <span className="text-red-600">*</span></p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={40} className={field} placeholder="رقم الجوال" />
              <input name="whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" maxLength={40} className={field} placeholder="رقم الواتساب" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">رابط يحوّل إليه (اختياري)</label>
            <input name="link" value={link} onChange={(e) => setLink(e.target.value)} maxLength={500} className={field} placeholder="https://…" />
          </div>

          {/* جدولة النشر — يظهر عند تفعيله من الإدارة وللإعلان الجديد فقط */}
          {allowSchedule && !initial?.id && (
            <div className="rounded-xl border-2 border-sky-300 bg-sky-50 p-3">
              <label className="mb-1 block text-sm font-bold text-sky-800">🕒 جدولة النشر (اختياري)</label>
              <input type="datetime-local" name="publishAt" className="h-11 w-full rounded-lg border border-sky-300 bg-white px-3 text-sm" dir="ltr" />
              <p className="mt-1 text-xs text-sky-700">حدّد موعداً مستقبلياً {scheduleMaxDays > 0 ? `(خلال ${scheduleMaxDays} يوماً)` : ''} لينشر إعلانك تلقائياً في وقته. اتركه فارغاً للنشر الآن.</p>
            </div>
          )}
        </fieldset>

        {/* شريط ثابت أسفل الشاشة (فوق القائمة السفلية) — لا يضيع بين خيارات التصميم الكثيرة */}
        <div className="sticky bottom-16 z-30 -mx-1 rounded-xl border-2 border-primary/20 bg-white/95 p-2 shadow-lg backdrop-blur">
          <Submit label={submitLabel ?? 'صمّم وانشر'} disabled={!!durationOptions && !duration} />
        </div>
      </form>
    </div>
  );
}

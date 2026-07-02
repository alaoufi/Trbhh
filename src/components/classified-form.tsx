'use client';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Phone, MessageCircle, ExternalLink, Sparkles, AlignRight, AlignCenter, ArrowUpToLine, ArrowDownToLine, AlignVerticalJustifyCenter, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CLASSIFIED_THEMES, CLASSIFIED_TEMPLATES, POS_CLASS, SIZE_TITLE, SIZE_BODY, SIZE_TITLE_POSTER, SIZE_BODY_POSTER,
  type Pos, type Align, type Size, type Pattern, type Accent, type Template,
} from '@/lib/classified-theme';
import { ClassifiedDecor } from '@/components/classified-decor';
import { SubmitOverlay } from '@/components/submit-overlay';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button size="lg" className="w-full gap-2" disabled={pending}><Sparkles className="h-4 w-4" /> {pending ? 'جارٍ التصميم والنشر...' : label}</Button>;
}

export type ClassifiedInitial = {
  id?: number; title?: string | null; body?: string | null; phone?: string | null; whatsapp?: string | null;
  link?: string | null; image?: string | null;
  theme?: number; pos?: Pos; align?: Align; size?: Size; bold?: boolean; pattern?: Pattern; accent?: Accent;
};

export function ClassifiedForm({ action, error, initial, submitLabel }: {
  action: (fd: FormData) => void | Promise<void>; error?: string; initial?: ClassifiedInitial; submitLabel?: string;
}) {
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
  const [advanced, setAdvanced] = useState(false);

  function applyTemplate(t: Template) {
    setTplId(t.id); setTheme(t.theme); setPos(t.pos); setAlign(t.align);
    setSize(t.size); setBold(t.bold); setPattern(t.pattern); setAccent(t.accent);
  }

  const field = 'h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40';
  const t = CLASSIFIED_THEMES[theme];
  const dark = t.text === 'dark' && !imgUrl;
  const wa = whatsapp.replace(/[^\d]/g, '');
  const posBtn = (p: Pos, Icon: React.ElementType) => (
    <button type="button" onClick={() => setPos(p)} className={`flex-1 rounded-lg border p-2 ${pos === p ? 'border-primary bg-accent text-primary' : 'border-primary/20'}`}><Icon className="mx-auto h-4 w-4" /></button>
  );

  function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setImgUrl(f ? URL.createObjectURL(f) : null);
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* preview + template library */}
      <div className="order-1 space-y-4 md:order-2">
        <div>
          <p className="mb-2 text-center text-xs text-muted-foreground">معاينة مباشرة</p>
          <div className="mx-auto max-w-[260px]">
            <div className="card-3d overflow-hidden rounded-2xl">
              <div
                className={`relative flex aspect-square flex-col overflow-hidden ${!imgUrl ? 'justify-center' : POS_CLASS[pos]} ${dark ? 'text-slate-900' : 'text-white'}`}
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
                <div className={`relative z-10 space-y-1.5 p-4 ${!imgUrl ? 'text-center' : align === 'center' ? 'text-center' : 'text-right'}`}>
                  {title && <h3 className={`line-clamp-4 leading-tight drop-shadow ${(!imgUrl ? SIZE_TITLE_POSTER : SIZE_TITLE)[size]} ${bold ? 'font-extrabold' : 'font-medium'}`}>{title}</h3>}
                  {body && <p className={`line-clamp-3 leading-snug drop-shadow ${(!imgUrl ? SIZE_BODY_POSTER : SIZE_BODY)[size]} ${dark ? 'text-slate-700' : 'text-white/90'}`}>{body}</p>}
                  {!title && !body && !imgUrl && <p className="text-sm opacity-80">اكتب نصاً أو أضف صورة…</p>}
                </div>
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
      <form action={action} className="order-2 space-y-4 md:order-1">
        <SubmitOverlay label="جارٍ التصميم والنشر…" />
        {initial?.id && <input type="hidden" name="id" value={initial.id} />}
        {error === 'content' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">أضف صورة أو نصّاً على الأقل.</div>}
        {error === 'contact' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">أضف رقم جوال أو واتساب على الأقل.</div>}
        {error === 'save' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">تعذّر حفظ الإعلان. حاول مرة أخرى، وإذا تكرّر أخبرنا.</div>}
        {error === 'window' && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">انتهت المدة المسموح بها لتعديل هذا الإعلان حسب إعدادات الموقع. للتعديل بعدها تواصل مع الإدارة.</div>}

        {/* hidden style fields */}
        <input type="hidden" name="theme" value={theme} />
        <input type="hidden" name="pos" value={pos} />
        <input type="hidden" name="align" value={align} />
        <input type="hidden" name="size" value={size} />
        <input type="hidden" name="pattern" value={pattern} />
        <input type="hidden" name="accent" value={accent} />
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
          {initial?.id && initial?.image && <p className="mt-1 text-xs text-muted-foreground">اترك الحقل فارغاً للإبقاء على الصورة الحالية.</p>}
        </div>

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

        {/* advanced fine-tuning */}
        <button type="button" onClick={() => setAdvanced((v) => !v)} className="text-sm font-medium text-primary underline-offset-2 hover:underline">
          {advanced ? 'إخفاء التخصيص المتقدّم' : 'تخصيص متقدّم للشكل'}
        </button>
        {advanced && (
          <div className="space-y-3 rounded-xl border border-primary/15 bg-accent/30 p-3">
            {!imgUrl && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">اللون</p>
                <div className="flex flex-wrap gap-2">
                  {CLASSIFIED_THEMES.map((th, i) => (
                    <button key={i} type="button" onClick={() => setTheme(i)} aria-label={`لون ${i + 1}`}
                      className={`h-7 w-7 rounded-full ring-2 ${theme === i ? 'ring-primary' : 'ring-transparent'}`}
                      style={{ backgroundImage: `linear-gradient(150deg, ${th.from}, ${th.to})` }} />
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">موضع المحتوى</p>
                <div className="flex gap-1">{posBtn('top', ArrowUpToLine)}{posBtn('center', AlignVerticalJustifyCenter)}{posBtn('bottom', ArrowDownToLine)}</div>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">المحاذاة</p>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setAlign('right')} className={`flex-1 rounded-lg border p-2 ${align === 'right' ? 'border-primary bg-accent text-primary' : 'border-primary/20'}`}><AlignRight className="mx-auto h-4 w-4" /></button>
                  <button type="button" onClick={() => setAlign('center')} className={`flex-1 rounded-lg border p-2 ${align === 'center' ? 'border-primary bg-accent text-primary' : 'border-primary/20'}`}><AlignCenter className="mx-auto h-4 w-4" /></button>
                </div>
              </div>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="flex-1">
                <p className="mb-1 text-xs font-medium text-muted-foreground">حجم الخط</p>
                <div className="flex gap-1">
                  {(['sm', 'md', 'lg'] as Size[]).map((s) => (
                    <button key={s} type="button" onClick={() => setSize(s)} className={`flex-1 rounded-lg border py-1.5 text-xs ${size === s ? 'border-primary bg-accent text-primary' : 'border-primary/20'}`}>{s === 'sm' ? 'صغير' : s === 'md' ? 'متوسط' : 'كبير'}</button>
                  ))}
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} /> غامق</label>
            </div>
          </div>
        )}

        <Submit label={submitLabel ?? 'صمّم وانشر'} />
      </form>
    </div>
  );
}

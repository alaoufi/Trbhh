'use client';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Phone, MessageCircle, ExternalLink, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PLACEMENTS, type PromoPackage, type PromoPlacement } from '@/lib/promo-placements';
import { SubmitOverlay } from '@/components/submit-overlay';

function Submit() {
  const { pending } = useFormStatus();
  return <Button size="lg" className="w-full gap-2" disabled={pending}><Megaphone className="h-4 w-4" /> {pending ? 'جارٍ الإرسال...' : 'إرسال للمراجعة والنشر'}</Button>;
}

const field = 'h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40';

export function PromoDesigner({
  action, packages, error, defaultPlacement, defaultPkg,
}: {
  action: (fd: FormData) => void | Promise<void>;
  packages: PromoPackage[];
  error?: string;
  defaultPlacement?: string;
  defaultPkg?: string;
}) {
  const [placement, setPlacement] = useState<PromoPlacement>(
    (PLACEMENTS.find((p) => p.key === defaultPlacement)?.key) ?? PLACEMENTS[0].key,
  );
  const [pkgId, setPkgId] = useState<number>(Number(defaultPkg) || packages[0]?.id || 0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [link, setLink] = useState('');
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  const place = PLACEMENTS.find((p) => p.key === placement)!;
  const pkg = packages.find((p) => p.id === pkgId);
  const wa = whatsapp.replace(/[^\d]/g, '');

  function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setImgUrl(f ? URL.createObjectURL(f) : null);
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* preview */}
      <div className="order-1 space-y-3 md:order-2">
        <p className="text-center text-xs text-muted-foreground">معاينة مباشرة — المقاس {place.size} (نسبة {place.ratio})</p>
        <div className="overflow-hidden rounded-xl border-2 border-primary/30 bg-slate-900" style={{ aspectRatio: place.ratio }}>
          <div className="relative flex h-full w-full items-center justify-center text-center text-white">
            {imgUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )}
            {imgUrl && <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />}
            <div className="relative z-10 space-y-1 p-4">
              {title && <div className="text-lg font-extrabold drop-shadow sm:text-2xl">{title}</div>}
              {body && <div className="text-xs opacity-90 drop-shadow sm:text-sm">{body}</div>}
              {!title && !body && !imgUrl && <div className="text-sm opacity-70">أضف صورة أو نصاً…</div>}
            </div>
            {link && <span className="absolute left-2 top-2 z-10 rounded-full bg-white/25 p-1 backdrop-blur"><ExternalLink className="h-3.5 w-3.5" /></span>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{place.desc}</p>
        {pkg && (
          <div className="rounded-lg border border-primary/20 bg-card p-3 text-sm">
            المدة: <b>{pkg.days}</b> يوم — السعر: <b>{pkg.price === 0 ? 'مجاني' : `${pkg.price} ﷼`}</b>
            <div className="text-xs text-muted-foreground">يبدأ العرض من تاريخ موافقة الإدارة لمدة {pkg.days} يوم.</div>
          </div>
        )}
      </div>

      {/* form */}
      <form action={action} className="order-2 space-y-4 md:order-1">
        <SubmitOverlay label="جارٍ رفع الإعلان الترويجي…" />
        {error === 'content' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">أضف صورة أو نصاً على الأقل.</div>}
        {error === 'contact' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">أضف رقم جوال أو واتساب.</div>}
        {error === 'package' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">اختر باقة صحيحة.</div>}
        {error === 'save' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">تعذّر الحفظ، حاول مجدداً.</div>}

        <input type="hidden" name="placement" value={placement} />
        <input type="hidden" name="packageId" value={pkgId} />

        <div>
          <label className="mb-1 block text-sm font-medium">مكان الإعلان</label>
          <select value={placement} onChange={(e) => setPlacement(e.target.value as PromoPlacement)} className={field}>
            {PLACEMENTS.map((p) => <option key={p.key} value={p.key}>{p.label} — {p.size}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">مدة الاشتراك</label>
          <select value={pkgId} onChange={(e) => setPkgId(Number(e.target.value))} className={field}>
            {packages.length === 0 && <option value={0}>لا توجد باقات متاحة</option>}
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.days} يوم — {p.price === 0 ? 'مجاني' : `${p.price} ﷼`}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">العنوان (اختياري)</label>
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} className={field} placeholder="عنوان الإعلان" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">النص (اختياري)</label>
          <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={500} className="w-full rounded-lg border border-primary/30 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" placeholder="وصف مختصر" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الصورة (ثابتة أو متحركة GIF)</label>
          <input name="image" type="file" accept="image/*" onChange={onImage} className="w-full rounded-lg border border-primary/30 bg-white p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1" />
        </div>

        <div className="rounded-lg border border-primary/20 bg-accent/40 p-3">
          <p className="mb-2 text-sm font-semibold text-primary">وسيلة التواصل <span className="text-red-600">*</span></p>
          <div className="grid gap-3 sm:grid-cols-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /> جوال</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><MessageCircle className="h-3.5 w-3.5" /> واتساب</span>
            <input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={40} className={field} placeholder="رقم الجوال" />
            <input name="whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" maxLength={40} className={field} placeholder="رقم الواتساب" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">رابط يحوّل إليه (اختياري)</label>
          <input name="link" value={link} onChange={(e) => setLink(e.target.value)} maxLength={500} className={field} placeholder="https://…" />
        </div>

        <Submit />
        <p className="text-xs text-muted-foreground">يُرسل الإعلان لمراجعة الإدارة، وبعد الموافقة يُنشر في المكان المختار للمدة المحددة.</p>
      </form>
    </div>
  );
}

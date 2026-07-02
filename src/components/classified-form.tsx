'use client';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Phone, MessageCircle, ExternalLink, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

const THEMES = [
  { from: '#3287da', to: '#1b4f8a' },
  { from: '#d4a017', to: '#8a6d0e' },
  { from: '#3287da', to: '#d4a017' },
  { from: '#0ea5e9', to: '#1d4ed8' },
  { from: '#f59e0b', to: '#b91c1c' },
  { from: '#10b981', to: '#0ea5e9' },
];

function Submit() {
  const { pending } = useFormStatus();
  return <Button size="lg" className="w-full gap-2" disabled={pending}><Sparkles className="h-4 w-4" /> {pending ? 'جارٍ التصميم والنشر...' : 'صمّم وانشر'}</Button>;
}

export function ClassifiedForm({ action, error }: { action: (fd: FormData) => void | Promise<void>; error?: string }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [link, setLink] = useState('');
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [theme, setTheme] = useState(0);

  const field = 'h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40';
  const t = THEMES[theme];

  function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setImgUrl(f ? URL.createObjectURL(f) : null);
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* live preview */}
      <div className="order-1 md:order-2">
        <p className="mb-2 text-center text-xs text-muted-foreground">معاينة مباشرة للتصميم</p>
        <div className="mx-auto max-w-[260px]">
          <div
            className="card-3d relative flex aspect-square flex-col justify-end overflow-hidden rounded-2xl text-white"
            style={imgUrl ? undefined : { backgroundImage: `linear-gradient(150deg, ${t.from}, ${t.to})` }}
          >
            {imgUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
              </>
            )}
            {link && <span className="absolute right-2 top-2 z-10 rounded-full bg-white/25 p-1 backdrop-blur"><ExternalLink className="h-3.5 w-3.5" /></span>}
            <div className="relative z-10 space-y-1 p-3">
              {title && <h3 className="line-clamp-2 text-sm font-extrabold leading-tight drop-shadow">{title}</h3>}
              {body && <p className="line-clamp-3 text-xs leading-snug text-white/90 drop-shadow">{body}</p>}
              {!title && !body && !imgUrl && <p className="text-xs text-white/80">اكتب نصاً أو أضف صورة…</p>}
              <div className="flex items-center gap-2 pt-1">
                {whatsapp && <span className="rounded-full bg-[#25D366] p-1"><MessageCircle className="h-3.5 w-3.5" /></span>}
                {phone && <span className="rounded-full bg-white/25 p-1 backdrop-blur"><Phone className="h-3.5 w-3.5" /></span>}
              </div>
            </div>
          </div>
          {/* theme picker */}
          {!imgUrl && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {THEMES.map((th, i) => (
                <button key={i} type="button" onClick={() => setTheme(i)} aria-label={`نمط ${i + 1}`}
                  className={`h-7 w-7 rounded-full ring-2 ${theme === i ? 'ring-primary' : 'ring-transparent'}`}
                  style={{ backgroundImage: `linear-gradient(150deg, ${th.from}, ${th.to})` }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* form */}
      <form action={action} className="order-2 space-y-4 md:order-1">
        {error === 'content' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">أضف صورة أو نصّاً على الأقل.</div>}
        {error === 'contact' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">أضف رقم جوال أو واتساب على الأقل.</div>}

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

        <Submit />
      </form>
    </div>
  );
}

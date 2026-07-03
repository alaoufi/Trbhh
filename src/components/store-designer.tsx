'use client';
import { useState } from 'react';
import { Store, Check, Users, Star, Palette, LayoutTemplate } from 'lucide-react';
import { STORE_COLORS, BANNERS, bannerBackground } from '@/lib/store-style';

type Initial = { storeName?: string | null; color?: string | null; banner?: string | null; tagline?: string | null; about?: string | null; logoUrl?: string | null };

/**
 * Smart store designer: pick a brand color from a large palette (or custom),
 * choose a banner style, add a name/tagline/about — with a live hero preview.
 * The inputs carry their form `name` so they submit within the parent form.
 */
export function StoreDesigner({ initial }: { initial: Initial }) {
  const [name, setName] = useState(initial.storeName || '');
  const [tagline, setTagline] = useState(initial.tagline || '');
  const [color, setColor] = useState(initial.color || '#3287da');
  const [banner, setBanner] = useState<string>(initial.banner || 'gradient');

  return (
    <div className="space-y-4">
      {/* live preview */}
      <div className="overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5">
        <div className="relative h-28" style={{ background: bannerBackground(banner, color) }}>
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-3">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 border-white bg-white/90 text-primary shadow">
              {initial.logoUrl
                ? // eslint-disable-next-line @next/next/no-img-element
                  <img src={initial.logoUrl} alt="" className="h-full w-full object-cover" />
                : <Store className="h-7 w-7" />}
            </span>
            <div className="min-w-0 pb-1 text-white drop-shadow">
              <div className="truncate text-lg font-extrabold">{name || 'اسم متجرك'}</div>
              <div className="truncate text-xs opacity-90">{tagline || 'شعار أو وصف قصير لمتجرك'}</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 bg-white p-2 text-center">
          {[{ i: Users, l: 'متابع' }, { i: Star, l: 'تقييم' }, { i: Store, l: 'إعلان' }].map((s, k) => (
            <div key={k} className="rounded-lg bg-secondary/40 py-1.5"><s.i className="mx-auto h-4 w-4" style={{ color }} /><div className="text-[10px] text-muted-foreground">{s.l}</div></div>
          ))}
        </div>
      </div>

      <div><label className="mb-1 block text-sm font-bold">اسم المتجر</label>
        <input name="storeName" value={name} onChange={(e) => setName(e.target.value)} className="h-11 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm" placeholder="اسم متجرك التجاري" /></div>

      <div><label className="mb-1 block text-sm font-bold">الشعار/الوصف القصير (Tagline)</label>
        <input name="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={160} className="h-11 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm" placeholder="مثال: كل ما تحتاجه لمشروعك بأفضل الأسعار" /></div>

      {/* color palette */}
      <div>
        <label className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Palette className="h-4 w-4 text-primary" /> لون هوية المتجر</label>
        <div className="flex flex-wrap gap-2">
          {STORE_COLORS.map((c) => (
            <button type="button" key={c} onClick={() => setColor(c)} aria-label={c}
              className="grid h-8 w-8 place-items-center rounded-full ring-2 ring-offset-2 transition" style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : undefined }}>
              {color === c && <Check className="h-4 w-4 text-white drop-shadow" />}
            </button>
          ))}
          <label className="grid h-8 w-8 cursor-pointer place-items-center rounded-full border-2 border-dashed border-primary/40 text-[9px] font-bold text-primary" title="لون مخصّص">
            +
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="sr-only" />
          </label>
        </div>
        <input type="hidden" name="color" value={color} />
      </div>

      {/* banner style */}
      <div>
        <label className="mb-2 flex items-center gap-1.5 text-sm font-bold"><LayoutTemplate className="h-4 w-4 text-primary" /> نمط الواجهة (البانر)</label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {BANNERS.map((b) => (
            <button type="button" key={b.id} onClick={() => setBanner(b.id)}
              className={`overflow-hidden rounded-xl border-2 text-center ${banner === b.id ? 'border-primary ring-2 ring-primary/30' : 'border-transparent'}`}>
              <span className="block h-8 w-full" style={{ background: bannerBackground(b.id, color) }} />
              <span className="block bg-white py-1 text-[10px] font-bold text-primary">{b.name}</span>
            </button>
          ))}
        </div>
        <input type="hidden" name="banner" value={banner} />
      </div>

      <div><label className="mb-1 block text-sm font-bold">نبذة عن المتجر</label>
        <textarea name="about" defaultValue={initial.about || ''} rows={3} className="w-full rounded-lg border-2 border-primary/25 bg-white p-3 text-sm" placeholder="تعريف جذّاب بمتجرك وخدماتك" /></div>
    </div>
  );
}

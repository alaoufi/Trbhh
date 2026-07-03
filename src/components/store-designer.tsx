'use client';
import { useState } from 'react';
import { Store, Check, Users, Star, Palette, LayoutTemplate, Sparkles, LayoutGrid, SlidersHorizontal, Eye } from 'lucide-react';
import { STORE_COLORS, BANNERS, STORE_TEMPLATES, STORE_LAYOUTS, CATALOG_STYLES, CATALOG_FIELDS, DEFAULT_CATALOG_FIELDS, bannerBackground, layoutTokens, isCatalogStyle } from '@/lib/store-style';
import { StoreCatalog, type CatalogAd } from '@/components/store-catalog';

type Initial = { storeName?: string | null; color?: string | null; banner?: string | null; tagline?: string | null; about?: string | null; layout?: string | null; catalog?: string | null; fields?: string | null; logoUrl?: string | null };

const SAMPLE_ADS: CatalogAd[] = [
  { id: 0, title: 'منتج تجريبي مميّز بجودة عالية', price: 349, adsType: 'offer', image: '/placeholder-ad.svg', cityName: 'الرياض', createdAt: null, special: true, views: 128, tier: null },
  { id: 0, title: 'منتج آخر للمعاينة على السوم', price: 0, adsType: 'offer', image: '/placeholder-ad.svg', cityName: 'جدة', createdAt: null, special: false, views: 54, tier: null },
];

/**
 * Smart store designer with a full library: choose a LAYOUT template (قالب),
 * a color THEME (تيم) or a custom color + banner, then name it — all with a
 * live hero preview. Inputs carry their form `name` so they submit in the parent.
 */
export function StoreDesigner({ initial }: { initial: Initial }) {
  const [name, setName] = useState(initial.storeName || '');
  const [tagline, setTagline] = useState(initial.tagline || '');
  const [color, setColor] = useState(initial.color || '#3287da');
  const [banner, setBanner] = useState<string>(initial.banner || 'gradient');
  const [layout, setLayout] = useState<string>(initial.layout || 'classic');
  const [catalog, setCatalog] = useState<string>(isCatalogStyle(initial.catalog) ? initial.catalog : 'tiles');
  const [fields, setFields] = useState<Set<string>>(new Set((initial.fields || DEFAULT_CATALOG_FIELDS).split(',').filter(Boolean)));
  const isNew = !initial.color;
  const [pickedTpl, setPickedTpl] = useState<string>('');
  const [tab, setTab] = useState<'layouts' | 'themes'>('layouts');
  const tk = layoutTokens(layout);

  const applyTheme = (t: (typeof STORE_TEMPLATES)[number]) => { setColor(t.color); setBanner(t.banner); setPickedTpl(t.id); };
  const toggleField = (f: string) => setFields((prev) => { const n = new Set(prev); if (n.has(f)) n.delete(f); else n.add(f); return n; });
  const catalogStyle = isCatalogStyle(catalog) ? catalog : 'tiles';

  return (
    <div className="space-y-4">
      {/* ===== المكتبة: قوالب + تيمات ===== */}
      <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-primary">
          <Sparkles className="h-4 w-4" /> مكتبة التصاميم
          {isNew && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">اختر بداية جاهزة</span>}
        </div>

        {/* تبويب القوالب / التيمات */}
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-white p-1 text-sm font-bold shadow-sm">
          <button type="button" onClick={() => setTab('layouts')} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 ${tab === 'layouts' ? 'bg-primary text-white' : 'text-muted-foreground'}`}><LayoutTemplate className="h-4 w-4" /> القوالب</button>
          <button type="button" onClick={() => setTab('themes')} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 ${tab === 'themes' ? 'bg-primary text-white' : 'text-muted-foreground'}`}><Palette className="h-4 w-4" /> التيمات</button>
        </div>

        {tab === 'layouts' ? (
          <>
            <p className="mb-2 text-xs text-muted-foreground">القالب يحدّد شكل واجهة متجرك وترتيبها.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STORE_LAYOUTS.map((l) => {
                const lt = layoutTokens(l.id);
                const on = layout === l.id;
                return (
                  <button type="button" key={l.id} onClick={() => setLayout(l.id)}
                    className={`overflow-hidden rounded-xl border-2 text-right transition ${on ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:-translate-y-0.5'}`}>
                    {/* wireframe mini-preview */}
                    <span className="relative block h-14 w-full bg-white p-1.5">
                      <span className={`flex h-8 w-full overflow-hidden ${lt.card === 'rounded-lg' ? 'rounded-md' : 'rounded-lg'} ${lt.align === 'center' ? 'flex-col items-center justify-center gap-0.5' : 'items-end gap-1 p-1'}`} style={{ background: bannerBackground(banner, color) }}>
                        <span className={`block ${lt.align === 'center' ? 'h-3 w-3' : 'h-4 w-4'} ${lt.logo === 'rounded-full' ? 'rounded-full' : 'rounded-[3px]'} border border-white bg-white/90`} />
                        <span className={`block h-1 ${lt.align === 'center' ? 'w-6' : 'w-8'} rounded bg-white/80`} />
                      </span>
                      <span className="mt-1 flex gap-1"><span className="h-2 flex-1 rounded bg-muted" /><span className="h-2 flex-1 rounded bg-muted" /></span>
                      {on && <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-white"><Check className="h-3 w-3" /></span>}
                    </span>
                    <span className="block bg-white px-2 py-1">
                      <span className="block text-[11px] font-bold text-foreground">{l.name}</span>
                      <span className="block text-[9px] text-muted-foreground">{l.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">التيم يضبط لون الهوية ونمط الواجهة بلمسة واحدة.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STORE_TEMPLATES.map((t) => (
                <button type="button" key={t.id} onClick={() => applyTheme(t)}
                  className={`overflow-hidden rounded-xl border-2 text-right transition ${pickedTpl === t.id ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:-translate-y-0.5'}`}>
                  <span className="relative flex h-12 w-full items-end" style={{ background: bannerBackground(t.banner, t.color) }}>
                    {pickedTpl === t.id && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-primary shadow"><Check className="h-3.5 w-3.5" /></span>}
                  </span>
                  <span className="block bg-white px-2 py-1">
                    <span className="block text-[11px] font-bold text-foreground">{t.name}</span>
                    <span className="block text-[9px] text-muted-foreground">{t.vibe}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ===== معاينة حيّة تعكس القالب ===== */}
      <div className={`overflow-hidden shadow-md ring-1 ring-black/5 ${tk.card}`}>
        <div className={`relative ${tk.hero}`} style={{ background: bannerBackground(banner, color) }}>
          <div className={`absolute inset-0 flex p-3 text-white drop-shadow ${tk.align === 'center' ? 'flex-col items-center justify-center gap-1 text-center' : 'items-end gap-3'}`}>
            <span className={`grid ${tk.align === 'center' ? 'h-14 w-14' : 'h-16 w-16'} shrink-0 place-items-center overflow-hidden border-4 border-white bg-white/90 text-primary shadow ${tk.logo}`}>
              {initial.logoUrl
                ? // eslint-disable-next-line @next/next/no-img-element
                  <img src={initial.logoUrl} alt="" className="h-full w-full object-cover" />
                : <Store className="h-7 w-7" />}
            </span>
            <div className={tk.align === 'center' ? '' : 'min-w-0 pb-1'}>
              <div className={`truncate font-extrabold ${tk.title}`}>{name || 'اسم متجرك'}</div>
              <div className="truncate text-xs opacity-90">{tagline || 'شعار أو وصف قصير لمتجرك'}</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 bg-white p-2 text-center">
          {[{ i: Users, l: 'متابع' }, { i: Star, l: 'تقييم' }, { i: LayoutGrid, l: 'منتج' }].map((s, k) => (
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

      <input type="hidden" name="layout" value={layout} />

      {/* ===== خيارات عرض الإعلانات: الشكل + الحقول ===== */}
      <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-primary"><SlidersHorizontal className="h-4 w-4" /> خيارات عرض الإعلانات</div>

        {/* شكل العرض */}
        <label className="mb-1 block text-xs font-bold text-muted-foreground">شكل عرض المنتجات</label>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CATALOG_STYLES.map((c) => (
            <button type="button" key={c.id} onClick={() => setCatalog(c.id)}
              className={`rounded-xl border-2 bg-white p-2 text-center transition ${catalog === c.id ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:-translate-y-0.5'}`}>
              <span className="block text-[12px] font-bold text-foreground">{c.name}</span>
              <span className="block text-[9px] text-muted-foreground">{c.desc}</span>
            </button>
          ))}
        </div>

        {/* الحقول الظاهرة */}
        <label className="mb-1 block text-xs font-bold text-muted-foreground">الحقول الظاهرة على البطاقة</label>
        <div className="flex flex-wrap gap-1.5">
          {CATALOG_FIELDS.map((f) => {
            const on = fields.has(f.id);
            return (
              <button type="button" key={f.id} onClick={() => toggleField(f.id)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition ${on ? 'border-primary bg-primary text-white' : 'border-primary/30 bg-white text-primary'}`}>
                {on ? <Check className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-current" />} {f.name}
              </button>
            );
          })}
        </div>

        {/* معاينة حيّة للكتالوج */}
        <div className="mt-3 rounded-xl bg-white p-2">
          <div className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-muted-foreground"><Eye className="h-3.5 w-3.5" /> معاينة العرض</div>
          <StoreCatalog ads={SAMPLE_ADS} style={catalogStyle} fields={fields} brand={color} />
        </div>

        <input type="hidden" name="catalog" value={catalog} />
        <input type="hidden" name="fields" value={[...fields].join(',')} />
      </div>

      <div><label className="mb-1 block text-sm font-bold">نبذة عن المتجر</label>
        <textarea name="about" defaultValue={initial.about || ''} rows={3} className="w-full rounded-lg border-2 border-primary/25 bg-white p-3 text-sm" placeholder="تعريف جذّاب بمتجرك وخدماتك" /></div>
    </div>
  );
}

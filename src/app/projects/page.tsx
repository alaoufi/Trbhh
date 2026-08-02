import Link from 'next/link';
import Image from 'next/image';
import { Building2, Plus, Search } from 'lucide-react';
import { listProjects } from '@/lib/projects';
import { getCities } from '@/lib/data';
import { PROJECT_TYPES } from '@/lib/realestate-types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'المشاريع العقارية' };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ city?: string; type?: string }> }) {
  const sp = await searchParams;
  const cityId = Number(sp.city) || undefined;
  const ptype = sp.type || undefined;
  const [projects, cities] = await Promise.all([listProjects({ cityId, ptype }), getCities().catch(() => [])]);
  const field = 'h-10 w-full rounded-lg border-2 border-primary/25 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';
  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-primary"><Building2 className="h-5 w-5" /> المشاريع العقارية</h1>
        <Link href="/account/projects" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4" /> أضف مشروعك</Link>
      </div>
      <p className="text-xs text-muted-foreground">مشاريع المطوّرين العقاريين المعتمدين — تصفّح المجمّعات والأبراج والمخططات المطوّرة.</p>

      <form method="get" className="card-3d grid grid-cols-2 gap-2 rounded-xl p-3 sm:grid-cols-4">
        <select name="type" defaultValue={sp.type || ''} className={field}>
          <option value="">كل الأنواع</option>
          {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select name="city" defaultValue={sp.city || ''} className={field}>
          <option value="">كل المدن</option>
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-bold text-white"><Search className="h-4 w-4" /> تصفية</button>
        {(cityId || ptype) && <Link href="/projects" className="inline-flex items-center justify-center rounded-lg border-2 border-primary/30 px-3 text-sm font-bold text-primary">مسح</Link>}
      </form>

      {projects.length === 0 ? (
        <div className="card-3d rounded-2xl p-8 text-center text-sm text-muted-foreground">لا توجد مشاريع معتمدة بعد.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card-3d overflow-hidden rounded-2xl transition hover:border-primary">
              <div className="relative h-40 w-full bg-gradient-to-br from-primary/20 to-emerald-200/40">
                {p.cover ? (
                  <Image src={p.cover} alt={p.name} fill sizes="(max-width:640px) 100vw, 33vw" className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-primary/40"><Building2 className="h-12 w-12" /></div>
                )}
                {p.ptype && <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-primary">{p.ptype}</span>}
              </div>
              <div className="p-3">
                <div className="line-clamp-1 font-extrabold text-foreground">{p.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{[p.district, p.cityName].filter(Boolean).join(' · ') || '—'}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {p.priceFrom ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">يبدأ من {fmt(p.priceFrom)} ر.س</span> : null}
                  {p.units != null ? <span className="rounded-full bg-secondary px-2 py-0.5 font-bold">{p.units} وحدة</span> : null}
                  {p.delivery ? <span className="rounded-full bg-secondary px-2 py-0.5 font-bold">تسليم {p.delivery}</span> : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

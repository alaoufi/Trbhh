import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Building2, MapPin, Ruler, CalendarClock, Wallet, BadgeCheck } from 'lucide-react';
import { getProject } from '@/lib/projects';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { PropertyMapEmbed } from '@/components/maps-embed';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProject(Number(id)).catch(() => null);
  return { title: p?.name || 'مشروع عقاري' };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) notFound();
  const p = await getProject(pid);
  if (!p) notFound();
  const session = await getSession();
  const isOwner = !!(session && session.uid === p.developerId);
  // العقار المعتمد فقط يظهر للعامة (المالك يرى مشروعه في كل الحالات)
  if (p.status !== 1 && !isOwner) notFound();

  const dev = await prisma.users
    .findUnique({ where: { id: BigInt(p.developerId) }, select: { name: true, userName: true } })
    .catch(() => null);
  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const loc = p.lat && p.lng ? { lat: parseFloat(p.lat), lng: parseFloat(p.lng) } : null;

  return (
    <div className="space-y-4">
      {p.status !== 1 && isOwner && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">مشروعك بانتظار اعتماد الإدارة — يظهر للعامة بعد الاعتماد.</div>
      )}
      <div className="card-3d overflow-hidden rounded-2xl">
        <div className="relative h-56 w-full bg-gradient-to-br from-primary/20 to-emerald-200/40">
          {p.cover ? (
            <Image src={p.cover} alt={p.name} fill sizes="100vw" className="object-cover" priority />
          ) : (
            <div className="flex h-full items-center justify-center text-primary/40"><Building2 className="h-16 w-16" /></div>
          )}
          {p.ptype && <span className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-primary">{p.ptype}</span>}
        </div>
        <div className="space-y-2 p-4">
          <h1 className="text-xl font-extrabold text-foreground">{p.name}</h1>
          <div className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" /> {[p.district, p.cityName].filter(Boolean).join(' · ') || '—'}</div>
          <div className="mt-1 grid grid-cols-3 gap-2 text-center text-xs">
            {p.priceFrom ? <div className="rounded-lg bg-emerald-50 p-2"><div className="flex items-center justify-center gap-1 font-extrabold text-emerald-800"><Wallet className="h-4 w-4" /> {fmt(p.priceFrom)}</div><div className="text-[11px] text-emerald-700">يبدأ من (ر.س)</div></div> : null}
            {p.units != null ? <div className="rounded-lg bg-secondary/50 p-2"><div className="flex items-center justify-center gap-1 font-extrabold text-primary"><Building2 className="h-4 w-4" /> {p.units}</div><div className="text-[11px] text-muted-foreground">وحدة</div></div> : null}
            {p.delivery ? <div className="rounded-lg bg-secondary/50 p-2"><div className="flex items-center justify-center gap-1 font-extrabold text-primary"><CalendarClock className="h-4 w-4" /></div><div className="text-[11px] text-muted-foreground">تسليم {p.delivery}</div></div> : null}
          </div>
        </div>
      </div>

      {p.description && (
        <div className="card-3d rounded-2xl p-4">
          <h2 className="mb-1.5 flex items-center gap-2 text-base font-extrabold text-primary"><Ruler className="h-4 w-4" /> عن المشروع</h2>
          <p className="whitespace-pre-line text-sm leading-7 text-foreground/90">{p.description}</p>
        </div>
      )}

      {/* المطوّر */}
      <div className="card-3d rounded-2xl p-4">
        <h2 className="mb-2 text-base font-extrabold text-primary">المطوّر العقاري</h2>
        <div className="flex items-center justify-between gap-2">
          <Link href={`/users/${p.developerId}`} className="flex items-center gap-1 font-bold text-primary hover:underline">
            <BadgeCheck className="h-4 w-4" /> {dev?.name || dev?.userName || 'مطوّر'}
          </Link>
          {p.reLicense && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800" dir="ltr">فال: {p.reLicense}</span>}
        </div>
      </div>

      {loc && (
        <div className="card-3d rounded-2xl p-4">
          <h2 className="mb-2 flex items-center gap-2 text-base font-extrabold text-primary"><MapPin className="h-4 w-4" /> موقع المشروع</h2>
          <PropertyMapEmbed lat={loc.lat} lng={loc.lng} />
        </div>
      )}
      <p className="pb-2 text-center text-[11px] text-muted-foreground">مشروع عقاري رقم {p.id} — منصّة تربح العقارية.</p>
    </div>
  );
}

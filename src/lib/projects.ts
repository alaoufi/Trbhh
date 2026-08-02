import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';
import { mediaUrl } from './media';

const ensure = ensureSchema;

export { PROJECT_TYPES } from './realestate-types';

export type ProjectCard = {
  id: number;
  name: string;
  cityName: string | null;
  district: string | null;
  ptype: string | null;
  units: number | null;
  priceFrom: number | null;
  delivery: string | null;
  cover: string | null;
  lat: string | null;
  lng: string | null;
  developerId: number;
  reLicense: string | null;
  description?: string | null;
  status: number;
};

async function coverUrls(ids: number[]): Promise<Map<number, string>> {
  const clean = ids.filter((n) => n > 0);
  if (!clean.length) return new Map();
  const rows = await prisma.uploads
    .findMany({ where: { id: { in: clean.map((n) => BigInt(n)) } }, select: { id: true, file_name: true } })
    .catch(() => [] as { id: bigint; file_name: string | null }[]);
  return new Map(rows.map((r) => [toInt(r.id), mediaUrl(r.file_name)]));
}

async function cityNames(ids: number[]): Promise<Map<number, string>> {
  const clean = [...new Set(ids.filter((n) => n > 0))];
  if (!clean.length) return new Map();
  const rows = await prisma.cities
    .findMany({ where: { id: { in: clean.map((n) => BigInt(n)) } }, select: { id: true, name: true } })
    .catch(() => [] as { id: bigint; name: string | null }[]);
  return new Map(rows.map((r) => [toInt(r.id), r.name || '']));
}

function rowToCard(r: Record<string, unknown>, covers: Map<number, string>, cities: Map<number, string>): ProjectCard {
  const cid = r.city_id ? toInt(r.city_id as bigint) : 0;
  const cov = r.cover ? toInt(r.cover as number) : 0;
  return {
    id: toInt(r.id as bigint),
    name: String(r.name || ''),
    cityName: cid ? cities.get(cid) || null : null,
    district: (r.district as string) || null,
    ptype: (r.ptype as string) || null,
    units: r.units != null ? Number(r.units) : null,
    priceFrom: r.price_from != null ? Number(r.price_from) : null,
    delivery: (r.delivery as string) || null,
    cover: cov ? covers.get(cov) || null : null,
    lat: (r.lat as string) || null,
    lng: (r.lng as string) || null,
    developerId: toInt(r.developer_id as bigint),
    reLicense: (r.re_license as string) || null,
    description: (r.description as string) || null,
    status: Number(r.status || 0),
  };
}

/** المشاريع المعتمدة (للعرض العام) — مع تصفية اختيارية بالمدينة/النوع. */
export async function listProjects(opts: { cityId?: number; ptype?: string; take?: number } = {}): Promise<ProjectCard[]> {
  await ensure();
  const rows = await prisma.re_projects
    .findMany({
      where: { status: 1, ...(opts.cityId ? { city_id: BigInt(opts.cityId) } : {}), ...(opts.ptype ? { ptype: opts.ptype } : {}) },
      orderBy: { id: 'desc' },
      take: opts.take || 60,
    })
    .catch(() => [] as Array<Record<string, unknown>>);
  if (!rows.length) return [];
  const [covers, cities] = await Promise.all([
    coverUrls(rows.map((r) => (r.cover ? toInt(r.cover as number) : 0))),
    cityNames(rows.map((r) => (r.city_id ? toInt(r.city_id as bigint) : 0))),
  ]);
  return rows.map((r) => rowToCard(r, covers, cities));
}

/** مشروع واحد بالتفصيل (أي حالة — التحقّق في الصفحة). */
export async function getProject(id: number): Promise<ProjectCard | null> {
  await ensure();
  const r = await prisma.re_projects.findUnique({ where: { id: BigInt(id) } }).catch(() => null);
  if (!r) return null;
  const rec = r as unknown as Record<string, unknown>;
  const [covers, cities] = await Promise.all([
    coverUrls([rec.cover ? toInt(rec.cover as number) : 0]),
    cityNames([rec.city_id ? toInt(rec.city_id as bigint) : 0]),
  ]);
  return rowToCard(rec, covers, cities);
}

/** مشاريع مطوّر معيّن (كل الحالات) — لإدارتها. */
export async function getDeveloperProjects(devId: number): Promise<ProjectCard[]> {
  await ensure();
  const rows = await prisma.re_projects
    .findMany({ where: { developer_id: BigInt(devId) }, orderBy: { id: 'desc' }, take: 100 })
    .catch(() => [] as Array<Record<string, unknown>>);
  if (!rows.length) return [];
  const [covers, cities] = await Promise.all([
    coverUrls(rows.map((r) => (r.cover ? toInt(r.cover as number) : 0))),
    cityNames(rows.map((r) => (r.city_id ? toInt(r.city_id as bigint) : 0))),
  ]);
  return rows.map((r) => rowToCard(r, covers, cities));
}

export async function createProject(devId: number, data: {
  name: string; cityId?: number | null; district?: string | null; ptype?: string | null;
  description?: string | null; units?: number | null; priceFrom?: number | null;
  delivery?: string | null; cover?: number | null; lat?: string | null; lng?: string | null; reLicense?: string | null;
}): Promise<number> {
  await ensure();
  const p = await prisma.re_projects.create({
    data: {
      developer_id: BigInt(devId),
      name: data.name.slice(0, 160),
      city_id: data.cityId ? BigInt(data.cityId) : null,
      district: data.district?.slice(0, 120) || null,
      ptype: data.ptype?.slice(0, 30) || null,
      description: data.description?.slice(0, 4000) || null,
      units: data.units ?? null,
      price_from: data.priceFrom ?? null,
      delivery: data.delivery?.slice(0, 40) || null,
      cover: data.cover ?? null,
      lat: data.lat || null,
      lng: data.lng || null,
      re_license: data.reLicense?.slice(0, 60) || null,
      status: 0,
    },
  }).catch(() => null);
  return p ? toInt(p.id) : 0;
}

/** المطوّر يحذف مشروعه. */
export async function deleteProject(id: number, devId: number): Promise<void> {
  await ensure();
  await prisma.re_projects.deleteMany({ where: { id: BigInt(id), developer_id: BigInt(devId) } }).catch(() => {});
}

/** الإدارة تغيّر حالة المشروع (اعتماد/إيقاف). */
export async function setProjectStatus(id: number, status: number): Promise<void> {
  await ensure();
  const st = [0, 1, 2].includes(status) ? status : 0;
  await prisma.re_projects.updateMany({ where: { id: BigInt(id) }, data: { status: st } }).catch(() => {});
}

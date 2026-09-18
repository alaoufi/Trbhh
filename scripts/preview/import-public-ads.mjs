/** Import a small, sanitized snapshot of published production ads into preview only. */
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const file = process.argv[2];
if (!file) throw new Error('A JSONL snapshot path is required.');
const raw = await readFile(file, 'utf8');
if (raw.length > 2_000_000) throw new Error('Snapshot exceeds the preview limit.');
const redact = (value) => String(value || '')
  .replace(/\b(?:\+?966|00966|0)?5\d{8}\b/g, '[بيانات اتصال محجوبة]')
  .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[بريد محجوب]')
  .slice(0, 5_000);
const rows = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).slice(0, 120);
const prisma = new PrismaClient({ log: [] });
try {
  const previewUrl = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1', 'preview-db'].includes(previewUrl.hostname) || previewUrl.pathname !== '/trbhh_preview_audit') {
    throw new Error('Refusing to import outside the isolated preview database.');
  }
  const data = rows.flatMap((row) => {
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id < 1 || id > 9_000_000_000) return [];
    const title = redact(row.title).slice(0, 255);
    if (!title) return [];
    const price = Number(row.price);
    return [{ id: BigInt(2_000_000_000 + id), adsType: 'offer', adsSpecial: 'no', state: 'active', status: 1,
      category_id: 13n, cat_reviewed: 0, country_id: 1, user_id: 1001n, profile_id: 1001n,
      city_id: 1n, area_id: 1, title, detail: redact(row.detail) || 'إعلان منشور في المعاينة.',
      video_path: '', phoneAllow: 0, commentAllow: 0, price: Number.isFinite(price) && price >= 0 ? Math.min(price, 99_999_999) : 0,
      price_type: 'fixed', store_only: 0, created_at: new Date(), updated_at: new Date() }];
  });
  if (data.length) await prisma.ads.createMany({ data, skipDuplicates: true });
  console.info(`[preview-public-import] Imported ${data.length} sanitized published ads into preview.`);
} finally {
  await prisma.$disconnect();
}

import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { CjProductRow } from './mapping';

export const ADMIN_CJ_PAGE_SIZE = 24;
export async function loadAdminCjCatalog(query: Record<string, string | string[] | undefined>, visibleOnly = false) {
  const requestedPage = typeof query.page === 'string' && /^[1-9]\d{0,8}$/.test(query.page) ? Number(query.page) : 1;
  const cat = typeof query.cat === 'string' && /^[1-9]\d{0,8}$/.test(query.cat) ? Number(query.cat) : 0;
  const where = Prisma.sql`WHERE 1=1 ${visibleOnly ? Prisma.sql`AND hidden=0` : Prisma.empty} ${cat ? Prisma.sql`AND category_id=${BigInt(cat)}` : Prisma.empty}`;
  const [count] = await prisma.$queryRaw<{ total: bigint; ready: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total, COALESCE(SUM(status='ready'),0) AS ready FROM cj_products ${where}`);
  const total = Number(count?.total), ready = Number(count?.ready);
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(ready) || ready < 0 || ready > total) throw Error('invalid_catalog_count');
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_CJ_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const items = await prisma.$queryRaw<CjProductRow[]>(Prisma.sql`SELECT * FROM cj_products ${where} ORDER BY id DESC LIMIT ${ADMIN_CJ_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_CJ_PAGE_SIZE}`);
  return { items, total, ready, page, pageCount, cat };
}

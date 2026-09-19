import 'server-only';
import { prisma } from '@/lib/prisma';
import { COMMERCE_DEFAULTS, commerceConfigFromRows } from './config';

/** Financial switches deliberately bypass best-effort/cached general settings.
 * An unavailable DB throws; callers must block checkout, not fall back to enabled.
 */
export async function getCommerceConfig() {
  const rows = await prisma.site_settings.findMany({
    where: { k: { in: Object.keys(COMMERCE_DEFAULTS) } },
    select: { k: true, v: true },
  });
  return commerceConfigFromRows(rows);
}

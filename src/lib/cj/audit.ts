import 'server-only';
import { createHash } from 'node:crypto';
import { logAdmin } from '@/lib/audit';
import type { CjProductRow } from './mapping';
import { parseCjAvailability } from './mapping';

const labels = { products: 'تعديل منتجات CJ', orders: 'تعديل طلبات CJ', shipping: 'تعديل شحن CJ', agents: 'تعديل وكلاء CJ', integrations: 'إعدادات تكامل CJ', pricing: 'تسعير CJ' } as const;
type Snapshot = Record<string, string | number | boolean | null>;
/** Content/contact fingerprints avoid copying free text, phone numbers or URLs into logs. */
export const cjAuditFingerprint = (value: string | null | undefined) => value ? createHash('sha256').update(value).digest('hex').slice(0, 24) : null;
export function cjProductAudit(row: CjProductRow | null): Snapshot {
  const availability = row ? parseCjAvailability(row) : null;
  return row ? { exists: true, status: row.status, hidden: row.hidden, agent: row.agent_user_id?.toString() ?? null, price: row.sale_price_override_minor,
    stockAvailable: availability?.stockQuantity ?? 0, shippingMethods: availability?.shippingOptions.length ?? 0,
    name: cjAuditFingerprint(row.name_ar), description: cjAuditFingerprint(row.display_description_ar), category: cjAuditFingerprint(row.trbhh_category) } : { exists: false };
}
/** One bounded before/after entry per changed field fits the existing 300-character audit note. */
export async function auditCjChange(actorId: number, module: keyof typeof labels, target: number | string, before: Snapshot, after: Snapshot) {
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const oldValue = before[field] ?? null, newValue = after[field] ?? null;
    if (oldValue === newValue) continue;
    await logAdmin(actorId, labels[module], String(target), JSON.stringify({ field, before: oldValue, after: newValue }));
  }
}

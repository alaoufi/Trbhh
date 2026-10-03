import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from './prisma';
import { getSetting } from './settings';
export const REPORT_COMMON_REASONS = 'report_common_reasons';
export const DEFAULT_REPORT_REASONS = 'احتيال أو محاولة نصب\nمعلومات مضللة أو غير صحيحة\nمحتوى مخالف أو غير مناسب\nإساءة أو مضايقة\nانتحال شخصية\nإعلان مكرر أو مزعج\nمشكلة تقنية في الموقع';
export type ReportReason = { value: string; label: string; legacyId: number };
export async function getReportReasons(): Promise<ReportReason[]> {
  const [rows, common] = await Promise.all([prisma.report_resons.findMany({ orderBy: { id: 'asc' } }), getSetting(REPORT_COMMON_REASONS, DEFAULT_REPORT_REASONS)]);
  const seen = new Set<string>(['سبب آخر']);
  const options: ReportReason[] = [];
  function add(value: string, text: string, legacyId: number) {
    const label = text.trim();
    if (!label || label.length > 80 || seen.has(label)) return;
    seen.add(label); options.push({ value, label, legacyId });
  }
  for (const row of rows) if (row.id > 0n && row.id <= 2147483647n) add(`db:${row.id}`, row.reason, Number(row.id));
  for (const label of common.split(/\r?\n/).slice(0, 40)) add(`common:${createHash('sha256').update(label.trim()).digest('hex').slice(0, 24)}`, label, 0);
  return [...options, { value: 'other', label: 'سبب آخر', legacyId: 0 }];
}

import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * دفتر محاسبة CJ — كل حركة مالية تمسّ محفظة CJ تُقيَّد سطراً واحداً بالدولار (عملة
 * المحفظة). entry_key فريد يمنع تكرار القيد (idempotency محاسبي صارم): لو أُعيد
 * استدعاء الدفع أو وصل حدث مكرّر، لا يُضاف قيد ثانٍ لنفس الحركة. هذا الدفتر هو مصدر
 * الحقيقة للمطابقة لاحقاً مع كشف CJ (رصيد/حركات) عبر cj_ref (معرّف الطلب لدى CJ).
 */

export type LedgerEntryType = 'charge' | 'fee' | 'refund' | 'adjust';
export type LedgerSource = 'internal' | 'cj' | 'system';

const bid = (v: number | bigint) => (typeof v === 'bigint' ? v : BigInt(v));

export type RecordLedgerInput = {
  entryKey: string;                 // مفتاح تفرّد القيد (idempotency)
  orderId?: number | bigint | null;
  entryType?: LedgerEntryType;
  amountUsdMinor: number;           // موجب = خصم من المحفظة؛ سالب = استرداد/تسوية
  cjRef?: string;                   // معرّف الطلب لدى CJ (للمطابقة)
  source?: LedgerSource;
  note?: string;
};

/** يضيف قيداً محاسبياً (idempotent عبر entry_key). يعيد هل أُدرج فعلاً. */
export async function recordLedgerEntry(input: RecordLedgerInput): Promise<boolean> {
  const entryKey = String(input.entryKey || '').trim().slice(0, 191);
  if (!entryKey) return false;
  const amount = Math.trunc(Number(input.amountUsdMinor));
  if (!Number.isFinite(amount)) return false;
  const r = await prisma.cj_ledger.createMany({
    data: [{
      entry_key: entryKey,
      order_id: input.orderId == null ? null : bid(input.orderId),
      entry_type: (input.entryType ?? 'charge').slice(0, 24),
      amount_usd_minor: amount,
      currency: 'USD',
      cj_ref: (input.cjRef ?? '').slice(0, 64),
      source: (input.source ?? 'internal').slice(0, 24),
      note: (input.note ?? '').slice(0, 500),
    }],
    skipDuplicates: true,
  }).catch(() => ({ count: 0 }));
  return r.count > 0;
}

/** قيود طلب واحد (للعرض في صفحة الطلب). */
export async function listOrderLedger(orderId: number | bigint) {
  return prisma.cj_ledger.findMany({ where: { order_id: bid(orderId) }, orderBy: { id: 'asc' } }).catch(() => []);
}

/** إجمالي الخصم الصافي من المحفظة (بالدولار، minor) عبر كل الدفتر. */
export async function ledgerNetOutflowUsdMinor(): Promise<number> {
  const agg = await prisma.cj_ledger.aggregate({ _sum: { amount_usd_minor: true } }).catch(() => null);
  return agg?._sum.amount_usd_minor ?? 0;
}

/**
 * مطابقة الدفتر مع رصيد CJ: صافي الخصم من الدفتر مقابل ما يُظهره كشف CJ.
 * لا تعدّل شيئاً — تقرير فقط ليراجعه المسؤول (الفرق = اختلاف يحتاج تدقيقاً).
 */
export type ReconcileReport = {
  ledgerNetUsdMinor: number;
  cjSpentUsdMinor: number | null;    // من مصدر خارجي إن توفّر، وإلا null
  differenceUsdMinor: number | null;
  entries: number;
};

export async function reconcileReport(cjSpentUsdMinor: number | null): Promise<ReconcileReport> {
  const net = await ledgerNetOutflowUsdMinor();
  const count = await prisma.cj_ledger.count().catch(() => 0);
  return {
    ledgerNetUsdMinor: net,
    cjSpentUsdMinor,
    differenceUsdMinor: cjSpentUsdMinor == null ? null : net - cjSpentUsdMinor,
    entries: count,
  };
}

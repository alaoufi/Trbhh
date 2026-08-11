import 'server-only';
import { ensureSchema } from '@/data/schema-sync';
import { prisma } from '@/lib/prisma';

const MIGRATION_NAME = 'wallet_money_v1';

type CountRow = { count: bigint };

export type WalletMoneyMigrationResult = {
  ok: boolean;
  migrated: boolean;
  report: string;
};

async function mismatchCount(table: string, condition: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(`SELECT COUNT(*) AS count FROM ${table} WHERE ${condition}`);
  return Number(rows[0]?.count || 0);
}

/**
 * One-time, explicit conversion from legacy whole riyals to parallel halala
 * columns. It is deliberately never called by page rendering or money writes.
 */
export async function migrateWalletMoneyV1(): Promise<WalletMoneyMigrationResult> {
  await ensureSchema();
  const lock = await prisma.$queryRawUnsafe<{ acquired: number }[]>("SELECT GET_LOCK('trbhh_wallet_money_v1', 15) AS acquired");
  if (!lock[0]?.acquired) return { ok: false, migrated: false, report: 'تعذّر الحصول على قفل ترحيل المحفظة' };

  try {
    const existing = await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM wallet_money_migrations WHERE name = '${MIGRATION_NAME}' LIMIT 1`);
    if (existing.length) return { ok: true, migrated: false, report: 'ترحيل الهللات منفذ ومطابق سابقاً' };

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('UPDATE users SET balance_halala = balance * 100, reserved_halala = reserved * 100 WHERE balance_halala IS NULL OR reserved_halala IS NULL');
      await tx.$executeRawUnsafe('UPDATE wallet_txns SET amount_halala = amount * 100, balance_after_halala = balance_after * 100 WHERE amount_halala IS NULL OR balance_after_halala IS NULL');
      await tx.$executeRawUnsafe('UPDATE wallet_topups SET amount_halala = amount * 100 WHERE amount_halala IS NULL');
      await tx.$executeRawUnsafe('UPDATE member_service_orders SET amount_halala = amount * 100 WHERE amount_halala IS NULL');
    });

    const checks = await Promise.all([
      mismatchCount('users', 'balance_halala IS NULL OR reserved_halala IS NULL OR balance_halala <> balance * 100 OR reserved_halala <> reserved * 100'),
      mismatchCount('wallet_txns', 'amount_halala IS NULL OR balance_after_halala IS NULL OR amount_halala <> amount * 100 OR balance_after_halala <> balance_after * 100'),
      mismatchCount('wallet_topups', 'amount_halala IS NULL OR amount_halala <> amount * 100'),
      mismatchCount('member_service_orders', 'amount_halala IS NULL OR amount_halala <> amount * 100'),
    ]);
    const failures = checks.reduce((sum, value) => sum + value, 0);
    if (failures) return { ok: false, migrated: false, report: `فشل تطابق ترحيل الهللات: ${failures} صف` };

    const report = 'تم ترحيل الرصيد والسجل والشحن والخدمات من الريال إلى الهللة مع تطابق كامل';
    await prisma.$executeRawUnsafe(`INSERT INTO wallet_money_migrations (name, completed_at, report) VALUES ('${MIGRATION_NAME}', NOW(), '${report}')`);
    return { ok: true, migrated: true, report };
  } catch (error) {
    return { ok: false, migrated: false, report: error instanceof Error ? error.message : 'فشل غير معروف في ترحيل الهللات' };
  } finally {
    await prisma.$queryRawUnsafe("SELECT RELEASE_LOCK('trbhh_wallet_money_v1')").catch(() => {});
  }
}

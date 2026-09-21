import 'server-only';
import { prisma } from '@/lib/prisma';
import { sealTokens, openTokens, type Tokens } from '@/lib/suppliers/crypto';

/**
 * تخزين رمز وصول CJ مُختوماً (AES-256-GCM) في جدول cj_auth (صف واحد id=1).
 * CJ يحدّ إصدار الرمز بمرّة كل ٥ دقائق، لذا نحفظه ونجدّده قبل انتهائه بدل طلبه كل مرّة.
 */
const CTX = 'cj:auth';

export type CjStoredAuth = {
  tokens: Tokens;
  accessExpiresAt: Date | null;
  refreshExpiresAt: Date | null;
};

type Row = { sealed_tokens: string | null; access_expires_at: Date | null; refresh_expires_at: Date | null };

export async function readCjAuth(encryptionKey: string): Promise<CjStoredAuth | null> {
  const rows = await prisma.$queryRaw<Row[]>`SELECT sealed_tokens, access_expires_at, refresh_expires_at FROM cj_auth WHERE id=1 LIMIT 1`.catch(() => [] as Row[]);
  const row = rows[0];
  if (!row?.sealed_tokens) return null;
  try {
    return {
      tokens: openTokens(row.sealed_tokens, CTX, encryptionKey),
      accessExpiresAt: row.access_expires_at,
      refreshExpiresAt: row.refresh_expires_at,
    };
  } catch {
    return null;
  }
}

export async function writeCjAuth(auth: CjStoredAuth, encryptionKey: string): Promise<void> {
  const sealed = sealTokens(auth.tokens, CTX, encryptionKey);
  await prisma.$executeRaw`
    INSERT INTO cj_auth (id, sealed_tokens, access_expires_at, refresh_expires_at)
    VALUES (1, ${sealed}, ${auth.accessExpiresAt}, ${auth.refreshExpiresAt})
    ON DUPLICATE KEY UPDATE sealed_tokens=VALUES(sealed_tokens), access_expires_at=VALUES(access_expires_at), refresh_expires_at=VALUES(refresh_expires_at)`;
}

export async function clearCjAuth(): Promise<void> {
  await prisma.$executeRaw`DELETE FROM cj_auth WHERE id=1`.catch(() => {});
}

/**
 * Runs once when the Next.js server boots (before serving traffic).
 * Guarantees the self-provisioned schema exists before any query — so typed
 * Prisma models can rely on columns like stores.status or users.ban_until
 * even on a freshly restored database.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.PREVIEW_SANDBOX === 'true') {
      const { prisma } = await import('@/lib/prisma');
      const marker = await prisma.site_settings.findUnique({where:{k:'preview_v2_seed'}});
      if (marker?.v !== '2026-09-19-v1') throw new Error('Sandbox seed marker missing');
    }
    if (process.env.PREVIEW_READ_ONLY === 'true') {
      const { prisma } = await import('@/lib/prisma');
      const { assertSelectOnlyGrants } = await import('@/lib/preview-grants');
      const grants = await prisma.$queryRawUnsafe<Record<string,string>[]>('SHOW GRANTS FOR CURRENT_USER');
      const roles = await prisma.$queryRawUnsafe<{role:string}[]>('SELECT CURRENT_ROLE() AS role');
      const schema = new URL(process.env.DATABASE_URL || '').pathname.slice(1);
      assertSelectOnlyGrants(grants.flatMap(Object.values),schema,roles[0]?.role || '');
      return;
    }
    const { ensureSchema } = await import('@/data/schema-sync');
    await ensureSchema().catch((e) => console.error('[schema-sync] failed at boot:', e));
  }
}

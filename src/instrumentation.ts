/**
 * Runs once when the Next.js server boots (before serving traffic).
 * Guarantees the self-provisioned schema exists before any query — so typed
 * Prisma models can rely on columns like stores.status or users.ban_until
 * even on a freshly restored database.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureSchema } = await import('@/data/schema-sync');
    await ensureSchema().catch((e) => console.error('[schema-sync] failed at boot:', e));
  }
}

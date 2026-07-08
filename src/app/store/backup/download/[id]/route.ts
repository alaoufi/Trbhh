import { getSession } from '@/lib/auth';
import { storeIdOfUser } from '@/lib/merchant';
import { getBackupJson } from '@/lib/store-backup';

export const dynamic = 'force-dynamic';

/** Download a store backup JSON — only the store owner can fetch their own. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession().catch(() => null);
  if (!session) return new Response('غير مصرّح', { status: 401 });
  const { id } = await params;
  const storeId = await storeIdOfUser(session.uid).catch(() => 0);
  if (!storeId) return new Response('لا يوجد متجر', { status: 404 });
  const json = await getBackupJson(storeId, Number(id)).catch(() => null);
  if (!json) return new Response('غير موجود', { status: 404 });
  return new Response(json, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="store-backup-${id}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}

import 'server-only';
import { prisma } from './prisma';
import { unlinkAccount } from './account-links';

export type MemberDependencies = {
  advertisements: number; stores: number; balanceHalala: number; walletTransactions: number; topups: number; messages: number;
};

export function dispositionFor(deps: MemberDependencies): 'archive' | 'delete' {
  return deps.advertisements > 0 || deps.stores > 0 || deps.balanceHalala !== 0 || deps.walletTransactions > 0 || deps.topups > 0 || deps.messages > 0
    ? 'archive' : 'delete';
}

export async function inspectMemberDependencies(userId: number): Promise<MemberDependencies> {
  const uid = BigInt(userId);
  const [advertisements, stores, user, walletTransactions, topups, sent, received] = await Promise.all([
    prisma.ads.count({ where: { user_id: uid } }).catch(() => 0),
    prisma.stores.count({ where: { user_id: userId } }).catch(() => 0),
    prisma.users.findUnique({ where: { id: uid }, select: { balance_halala: true, reserved_halala: true, balance: true, reserved: true } }).catch(() => null),
    prisma.wallet_txns.count({ where: { user_id: uid } }).catch(() => 0),
    prisma.wallet_topups.count({ where: { user_id: uid } }).catch(() => 0),
    prisma.chats.count({ where: { sender_id: userId } }).catch(() => 0),
    prisma.chats.count({ where: { reciver_id: userId } }).catch(() => 0),
  ]);
  const balanceHalala = (user?.balance_halala ?? (user?.balance ?? 0) * 100) + (user?.reserved_halala ?? (user?.reserved ?? 0) * 100);
  return { advertisements, stores, balanceHalala, walletTransactions, topups, messages: sent + received };
}

export async function archiveMemberAccount(userId: number, adminId: number, reason: string): Promise<void> {
  await unlinkAccount(userId);
  // Preserve each record, but remove it from all live visitor listings.
  await prisma.ads.updateMany({ where: { user_id: BigInt(userId) }, data: { status: 0, data_archive: new Date().toISOString(), paused_by_owner: 0 } });
  await prisma.stores.updateMany({ where: { user_id: userId }, data: { status: 0 } });
  await prisma.users.update({
    where: { id: BigInt(userId) },
    data: { archived_at: new Date(), archived_by: BigInt(adminId), archive_reason: reason.slice(0, 300) || 'أرشفة إدارية', token: null, remember_token: null },
  });
}

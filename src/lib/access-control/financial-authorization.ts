import 'server-only';
import type {Prisma} from '@prisma/client';
import {permissionKeySet} from './catalog';
import {readAccess} from './store';

/** Call inside the financial transaction, before locking financial rows.
 * This is the same mutex used by permission and staff-account changes.
 * A grant revoked after the HTTP check cannot authorize a financial write.
 */
export async function requireFinancePermission(tx:Prisma.TransactionClient,actorId:bigint,key:string):Promise<void>{
  if(actorId<=0n||actorId>BigInt(Number.MAX_SAFE_INTEGER)||!permissionKeySet.has(key))throw new Error('access_forbidden');
  const state=await tx.$queryRaw<{initialized_at:Date|null}[]>`SELECT initialized_at FROM access_control_state WHERE id=1 FOR UPDATE`;
  if(!state[0]?.initialized_at)throw new Error('access_forbidden');
  const access=await readAccess(tx,Number(actorId));
  if(!access.ready||!access.keys.has(key)||!access.keys.has(key.split(':')[0]+':view'))throw new Error('access_forbidden');
}

export async function enforceFinanceChecker(tx:Prisma.TransactionClient,actorId:bigint,makerId:bigint,key:string):Promise<{mode:'independent_checker'|'sole_approver';makerId:string;checkerId:string}>{
  await requireFinancePermission(tx,actorId,key);
  if(makerId<=0n)throw new Error('access_forbidden');
  if(actorId!==makerId)return {mode:'independent_checker',makerId:String(makerId),checkerId:String(actorId)};
  // View and approval may come from different roles; both must be effective.
  const rows=await tx.$queryRawUnsafe<{n:bigint}[]>(`SELECT COUNT(*) AS n FROM users u
    WHERE u.id<>? AND u.archived_at IS NULL AND COALESCE(u.merged_into,0)=0
    AND (COALESCE(u.ban,'no')<>'checked' OR (u.ban_until IS NOT NULL AND u.ban_until<=UTC_TIMESTAMP()))
    AND EXISTS(SELECT 1 FROM access_user_roles a JOIN access_roles r ON r.id=a.role_id AND r.active=1
      JOIN access_departments d ON d.id=r.department_id AND d.active=1
      JOIN access_role_permissions p ON p.role_id=r.id WHERE a.user_id=u.id AND BINARY p.permission=?)
    AND EXISTS(SELECT 1 FROM access_user_roles a JOIN access_roles r ON r.id=a.role_id AND r.active=1
      JOIN access_departments d ON d.id=r.department_id AND d.active=1
      JOIN access_role_permissions p ON p.role_id=r.id WHERE a.user_id=u.id AND BINARY p.permission=?)`,actorId,key,key.split(':')[0]+':view');
  if(!rows[0]||Number(rows[0].n)!==0)throw new Error('finance_independent_checker_required');
  return {mode:'sole_approver',makerId:String(makerId),checkerId:String(actorId)};
}

import 'server-only';
import type {Prisma} from '@prisma/client';
export const AUTH_REQUIRE_ADMIN_MFA='auth_require_admin_mfa';
/** Shared by web security settings, role grants and the explicit offline migration. */
export async function lockAuthPolicy(tx:Prisma.TransactionClient):Promise<boolean>{
  await tx.$executeRawUnsafe('INSERT IGNORE INTO site_settings (k,v) VALUES (?,?)',AUTH_REQUIRE_ADMIN_MFA,'0');
  const rows=await tx.$queryRawUnsafe<{v:string}[]>('SELECT v FROM site_settings WHERE k = ? FOR UPDATE',AUTH_REQUIRE_ADMIN_MFA);
  return rows[0]?.v==='1';
}

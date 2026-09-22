'use strict';
// Read-only operator evidence. Never emit credentials, tokens, contact details or row contents.
const {PrismaClient}=require('@prisma/client');
async function main(){
 const db=new PrismaClient({log:[]});
 try{
  const tables=(await db.$queryRawUnsafe('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()')).map(r=>r.name);
  const counts={};
  for(const name of ['users','ads','stores','commerce_orders','commerce_receipts','commerce_supplier_accruals','supplier_connections','supplier_products','finance_invoices','access_roles','access_user_roles']){
   counts[name]=tables.includes(name)?String((await db.$queryRawUnsafe('SELECT COUNT(*) AS n FROM `'+name+'`'))[0].n):null;
  }
  const admins=await db.$queryRawUnsafe("SELECT u.id,u.name,(u.archived_at IS NULL AND COALESCE(u.merged_into,0)=0 AND (COALESCE(u.ban,'no')<>'checked' OR (u.ban_until IS NOT NULL AND u.ban_until<=UTC_TIMESTAMP()))) AS active FROM users u WHERE u.is_admin=1 ORDER BY u.id");
  const flags=await db.$queryRawUnsafe("SELECT k,v FROM site_settings WHERE k IN ('commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled','require_admin_mfa')");
  const initialized=tables.includes('access_control_state')?await db.$queryRawUnsafe('SELECT initialized_at FROM access_control_state WHERE id=1'):[];
  const database=(await db.$queryRawUnsafe('SELECT COALESCE(SUM(DATA_LENGTH+INDEX_LENGTH),0) AS bytes FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()'))[0];
  const profiles=tables.includes('supplier_integration_profiles')?await db.$queryRawUnsafe('SELECT p.supplier_id,p.provider,p.mode,s.active,p.maintenance,p.sync_enabled,p.auto_orders_enabled,p.last_error FROM supplier_integration_profiles p JOIN commerce_suppliers s ON s.id=p.supplier_id ORDER BY p.supplier_id'):[];
  console.log(JSON.stringify({counts,admins:admins.map(r=>({id:String(r.id),name:r.name,active:Boolean(r.active)})),flags:flags.map(r=>({key:r.k,disabled:r.v==null||r.v==='0'||r.v==='false',enabled:r.v==='1'||r.v==='true'})),accessInitialized:Boolean(initialized[0]?.initialized_at),financeTables:tables.filter(n=>n.startsWith('finance_')),databaseBytes:String(database.bytes),supplierLiveOrders:process.env.SUPPLIER_ALLOW_LIVE_ORDERS==='true',captureConfigured:(process.env.FINANCE_CAPTURE_SECRET||'').length>=32,profiles},(_,v)=>typeof v==='bigint'?String(v):v));
 }finally{await db.$disconnect();}
}
main().catch(()=>{console.error('finance_runtime_inspection_failed');process.exitCode=1;});

import {requireUser} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {readCustomerInvoiceForPrint} from '@/lib/finance/customer-exports';
import {printableFinanceInvoice} from '@/lib/finance/exports';
import {accessActor} from '@/lib/access-control/guards';
import {withFinanceAuditContext} from '@/lib/finance/audit-context';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await requireUser(),{id}=await params;
  if(!/^[1-9]\d{0,14}$/.test(id))return new Response('غير موجود',{status:404});
  const actor=await accessActor(session);
  const invoice=await withFinanceAuditContext({ip:actor.ip,sessionFingerprint:actor.sessionFingerprint},()=>readCustomerInvoiceForPrint(prisma,session,id));
  if(!invoice)return new Response('غير موجود',{status:404});
  return new Response(printableFinanceInvoice(invoice,false),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'"}});
}

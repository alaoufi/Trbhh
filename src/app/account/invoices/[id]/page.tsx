import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {readFinanceInvoice} from '@/lib/finance/documents';
import {FinanceInvoiceView} from '@/components/finance/finance-invoice-view';
export const dynamic='force-dynamic';
export default async function CustomerInvoicePage({params}:{params:Promise<{id:string}>}){
  const session=await requireUser(),{id}=await params;
  if(!/^[1-9]\d{0,14}$/.test(id))notFound();
  const invoice=await readFinanceInvoice(prisma,id,session.uid);
  if(!invoice)notFound();
  return <FinanceInvoiceView invoice={invoice} internal={false} printHref={`/account/invoices/${id}/print`} />;
}

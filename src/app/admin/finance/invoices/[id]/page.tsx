import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getFinancePermissions, requireFinance } from '@/lib/finance/permissions';
import { readFinanceData } from '@/lib/finance/read-model';
import { FinanceInvoiceView } from '@/components/finance/finance-invoice-view';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'سجل الفاتورة | تربح' };

export default async function FinanceInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireFinance('invoices');
  const [{ id }, query, data, permissions] = await Promise.all([params, searchParams, readFinanceData(prisma), getFinancePermissions(session.uid,'invoices')]);
  const invoice = data.invoices.find(item => item.id === id);
  if (!invoice) notFound();
  return <FinanceInvoiceView invoice={invoice} internal={query.view !== 'customer'} canExport={permissions.export} />;
}

import { AccessPage } from '@/components/access-boundary';
import { requireAdminPage, readActorAccess } from '@/lib/access-control/guards';
import Link from 'next/link';

import { prisma } from '@/lib/prisma';
import { assertSupplierSchemaReady } from '@/lib/suppliers/schema';
import { loadCatalog } from '@/lib/suppliers/catalog-admin';
import { SupplierCatalog } from '@/components/supplier-catalog';
import { searchProducts, productDetails, reviewProducts, approveProducts, updateProductSale, hideProduct, removeProduct } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'اختيار منتجات سلة', robots: { index: false, follow: false } };

export default async function SupplierCatalogPage() {
  const session=await requireAdminPage('/admin/suppliers/catalog');
  const {keys}=await readActorAccess(session.uid);
  let data;
  try {
    await assertSupplierSchemaReady(prisma);
    data = await loadCatalog(prisma, { query: '', supplierKey: '', page: 1 });
  } catch {
    return <section dir="rtl" className="space-y-4 rounded-xl border bg-white p-5">
      <h1 className="text-xl font-bold">اختيار منتجات سلة</h1>
      <p role="alert">تعذر تحميل المنتجات المستوردة. لم يتم تغيير أي منتج. راجع حالة الربط ثم أعد فتح الكتالوج.</p>
      <AccessPage href="/admin/suppliers/integrations"><Link href="/admin/suppliers/integrations" className="font-bold underline">إعدادات الربط والمزامنة</Link></AccessPage>
    </section>;
  }
  return <div className="space-y-4" dir="rtl">
    <nav aria-label="إدارة الموردين" className="flex flex-wrap gap-4 text-sm font-semibold text-primary">
      <AccessPage href="/admin/suppliers"><Link href="/admin/suppliers" className="underline">الموردون</Link></AccessPage>
      <AccessPage href="/admin/suppliers/integrations"><Link href="/admin/suppliers/integrations" className="underline">الربط والمزامنة وإعدادات النشر</Link></AccessPage>
    </nav>
    <SupplierCatalog capabilities={{create:keys.has('products:create'),approve:keys.has('products:approve'),edit:keys.has('products:edit'),suspend:keys.has('products:suspend'),delete:keys.has('products:delete')}} initialData={data} actions={{ search: searchProducts, details: productDetails, review: reviewProducts, approve: approveProducts, updateSale: updateProductSale, hide: hideProduct, remove: removeProduct }} />
  </div>;
}

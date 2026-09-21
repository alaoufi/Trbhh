'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAction } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { parseSupplier, parseSupplierProduct } from '@/lib/commerce/supplier-input';
import { assertCommerceSchemaReady } from '@/lib/commerce/schema';
import { normalizeStoreCoordinatorPhone } from '@/lib/suppliers/coordinator';

export async function saveSupplier(form: FormData) {
  const rawId = String(form.get('id') || '');
  const session = await requireAction('suppliers', rawId ? 'edit' : 'add');
  if (rawId && !/^[1-9]\d{0,14}$/.test(rawId)) redirect('/admin/suppliers?error=fields');
  let data: ReturnType<typeof parseSupplier>;
  try { data = parseSupplier(form); } catch { redirect('/admin/suppliers?error=fields'); }
  try {
    await assertCommerceSchemaReady(prisma);
    await prisma.$transaction(async tx => {
      let auditId = rawId;
      if (rawId) {
        const id = BigInt(rawId);
        const [existing] = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM commerce_suppliers WHERE id=${id} FOR UPDATE`;
        if (!existing) throw new Error('supplier_not_found');
        await tx.$executeRaw`UPDATE commerce_suppliers SET name=${data.name},contact_name=${data.contactName},phone=${data.phone},email=${data.email},address=${data.address},registration_number=${data.registrationNumber},tax_number=${data.taxNumber},settlement_terms=${data.settlementTerms},notes=${data.notes},active=${Number(data.active)},api_base_url=${data.apiBaseUrl},api_credential_ref=${data.apiCredentialRef},api_enabled=0,updated_at=CURRENT_TIMESTAMP(3) WHERE id=${id}`;
      } else {
        await tx.$executeRaw`INSERT INTO commerce_suppliers (name,contact_name,phone,email,address,registration_number,tax_number,settlement_terms,notes,active,api_base_url,api_credential_ref,api_enabled) VALUES (${data.name},${data.contactName},${data.phone},${data.email},${data.address},${data.registrationNumber},${data.taxNumber},${data.settlementTerms},${data.notes},${Number(data.active)},${data.apiBaseUrl},${data.apiCredentialRef},0)`;
        const [inserted] = await tx.$queryRaw<{ id: bigint }[]>`SELECT LAST_INSERT_ID() AS id`;
        if (!inserted?.id) throw new Error('supplier_insert_failed');
        auditId = inserted.id.toString();
      }
      // No contact details, endpoint, credential reference or supplied free text in audit.
      await tx.admin_log.create({ data: { admin_id: BigInt(session.uid), action: 'حفظ مورد تربح', target: auditId, note: `نشط=${Number(data.active)}; الربط البرمجي معطل` } });
    });
  } catch { redirect('/admin/suppliers?error=save'); }
  revalidatePath('/admin/suppliers');
  redirect('/admin/suppliers?saved=1');
}

export async function saveSupplierProduct(form: FormData) {
  const session = await requireAction('suppliers', 'edit');
  let data: ReturnType<typeof parseSupplierProduct>;
  try { data = parseSupplierProduct(form); } catch { redirect('/admin/suppliers?error=mapping'); }
  try {
    await assertCommerceSchemaReady(prisma);
    await prisma.$transaction(async tx => {
      // Match order creation's lock order: product first, supplier second.
      const [product] = await tx.$queryRaw<{ id: bigint; approved: number }[]>`SELECT id,approved FROM commerce_products WHERE id=${data.productId} FOR UPDATE`;
      if (!product || product.approved !== 1) throw new Error('product_not_approved');
      const [supplier] = await tx.$queryRaw<{ id: bigint; active: number }[]>`SELECT id,active FROM commerce_suppliers WHERE id=${data.supplierId} FOR UPDATE`;
      if (!supplier || supplier.active !== 1) throw new Error('supplier_not_active');
      await tx.$executeRaw`INSERT INTO commerce_product_suppliers (product_id,supplier_id,supplier_sku,unit_cost_minor,currency) VALUES (${data.productId},${data.supplierId},${data.supplierSku},${data.unitCostMinor},'SAR') ON DUPLICATE KEY UPDATE supplier_id=VALUES(supplier_id),supplier_sku=VALUES(supplier_sku),unit_cost_minor=VALUES(unit_cost_minor),currency='SAR'`;
      await tx.admin_log.create({ data: { admin_id: BigInt(session.uid), action: 'ربط سلعة بمورد', target: data.productId.toString(), note: `مورد=${data.supplierId}; تكلفة الوحدة=${data.unitCostMinor} هللة؛ للطلبات الجديدة فقط` } });
    });
  } catch { redirect('/admin/suppliers?error=mapping'); }
  revalidatePath('/admin/suppliers');
  redirect('/admin/suppliers?saved=1');
}

/** Separate from the supplier/account phone and every Salla credential. An
 * empty value explicitly removes the operational coordinator. */
export async function saveStoreCoordinator(form:FormData){
  const session=await requireAction('suppliers','edit');
  const rawId=String(form.get('coordinatorSupplierId')||'');
  if(!/^[1-9]\d{0,14}$/.test(rawId))redirect('/admin/suppliers?error=coordinator');
  let phone:string;
  try{phone=normalizeStoreCoordinatorPhone(String(form.get('storeCoordinatorPhone')||''));}
  catch{redirect('/admin/suppliers?error=coordinator');}
  try{
    await assertCommerceSchemaReady(prisma);
    await prisma.$transaction(async tx=>{
      const id=BigInt(rawId);
      const [supplier]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_suppliers WHERE id=${id} FOR UPDATE`;
      if(!supplier)throw new Error('supplier_not_found');
      await tx.$executeRaw`UPDATE commerce_suppliers SET store_coordinator_phone=${phone},updated_at=CURRENT_TIMESTAMP(3) WHERE id=${id}`;
      await tx.admin_log.create({data:{admin_id:BigInt(session.uid),action:phone?'تحديث منسق متجر':'حذف منسق متجر',target:rawId,note:phone?'تم حفظ رقم منسق تشغيلي منفصل':'تم حذف رقم المنسق التشغيلي'}});
    });
  }catch{redirect('/admin/suppliers?error=coordinator');}
  revalidatePath('/admin/suppliers');
  redirect('/admin/suppliers?coordinator=1');
}

const supplierId = (form: FormData) => {
  const raw = String(form.get('supplierId') || '');
  if (!/^[1-9]\d{0,14}$/.test(raw)) throw new Error('delete_confirmation');
  return BigInt(raw);
};
function confirmed(form: FormData, phrase: string) {
  const name = String(form.get('confirmName') || '').normalize('NFKC').trim();
  const expected = String(form.get('supplierName') || '').normalize('NFKC').trim();
  const typed = String(form.get('confirmPhrase') || '').normalize('NFKC').trim();
  if (!name || !expected || name !== expected || typed !== phrase || form.get('acknowledge') !== '1') throw new Error('delete_confirmation');
  return name;
}
function deleteRedirect(error: unknown): never {
  const code = error instanceof Error && ['delete_confirmation','delete_products_first','delete_history','delete_not_found'].includes(error.message) ? error.message : 'delete_failed';
  redirect(`/admin/suppliers?error=${code}`);
}

/** Destructive step one: remove source/catalog products only when no order history exists. */
export async function deleteSupplierProducts(form: FormData) {
  const session = await requireAction('suppliers', 'delete');
  let id: bigint, confirmName: string;
  try { id = supplierId(form); confirmName = confirmed(form, 'حذف منتجات المورد'); } catch (error) { deleteRedirect(error); }
  try {
    await assertCommerceSchemaReady(prisma);
    await prisma.$transaction(async tx => {
      const [supplier] = await tx.$queryRaw<{id: bigint; name: string}[]>`SELECT id,name FROM commerce_suppliers WHERE id=${id} FOR UPDATE`;
      if (!supplier) throw new Error('delete_not_found');
      if (supplier.name.normalize('NFKC').trim() !== confirmName) throw new Error('delete_confirmation');
      const [counts] = await tx.$queryRaw<{history_count: bigint}[]>`SELECT
        ((SELECT COUNT(*) FROM supplier_orders WHERE supplier_id=${id})+
         (SELECT COUNT(*) FROM commerce_order_suppliers WHERE supplier_id=${id})+
         (SELECT COUNT(*) FROM commerce_supplier_accruals WHERE supplier_id=${id})+
         (SELECT COUNT(*) FROM supplier_reservation_allocations a JOIN supplier_stock_reservations r ON r.id=a.reservation_id JOIN supplier_products p ON p.id=r.supplier_product_id WHERE p.supplier_id=${id})) AS history_count`;
      if (Number(counts?.history_count || 0) > 0) throw new Error('delete_history');
      const products = await tx.$queryRaw<{commerce_product_id: bigint | null}[]>`SELECT commerce_product_id FROM supplier_products WHERE supplier_id=${id} FOR UPDATE`;
      await tx.$executeRaw`DELETE h FROM supplier_price_history h JOIN supplier_products p ON p.id=h.supplier_product_id WHERE p.supplier_id=${id}`;
      await tx.$executeRaw`DELETE t FROM supplier_price_tiers t JOIN supplier_products p ON p.id=t.supplier_product_id WHERE p.supplier_id=${id}`;
      await tx.$executeRaw`DELETE r FROM supplier_stock_reservations r JOIN supplier_products p ON p.id=r.supplier_product_id WHERE p.supplier_id=${id}`;
      await tx.$executeRaw`DELETE FROM commerce_product_suppliers WHERE supplier_id=${id}`;
      await tx.$executeRaw`UPDATE supplier_products SET commerce_product_id=NULL WHERE supplier_id=${id}`;
      await tx.$executeRaw`DELETE FROM supplier_products WHERE supplier_id=${id}`;
      for (const product of products) if (product.commerce_product_id) await tx.$executeRaw`DELETE p FROM commerce_products p LEFT JOIN commerce_order_items i ON i.product_id=p.id LEFT JOIN supplier_reservation_allocations a ON a.commerce_product_id=p.id LEFT JOIN commerce_product_suppliers m ON m.product_id=p.id WHERE p.id=${product.commerce_product_id} AND i.id IS NULL AND a.id IS NULL AND m.product_id IS NULL`;
      await tx.admin_log.create({data:{admin_id:BigInt(session.uid),action:'حذف منتجات مورد',target:id.toString(),note:`المورد=${supplier.name}; تم حذف منتجات الكتالوج قبل ملف المورد`}});
    });
  } catch (error) { deleteRedirect(error); }
  revalidatePath('/admin/suppliers');revalidatePath('/admin/suppliers/catalog');revalidatePath('/admin/suppliers/integrations');revalidatePath('/shop');
  redirect('/admin/suppliers?deleted=products');
}

/** Destructive step two: delete the supplier only after its products and history are both empty. */
export async function deleteSupplier(form: FormData) {
  const session = await requireAction('suppliers', 'delete');
  let id: bigint, confirmName: string;
  try { id = supplierId(form); confirmName = confirmed(form, 'حذف المورد نهائياً'); } catch (error) { deleteRedirect(error); }
  try {
    await assertCommerceSchemaReady(prisma);
    await prisma.$transaction(async tx => {
      const [supplier] = await tx.$queryRaw<{id: bigint; name: string}[]>`SELECT id,name FROM commerce_suppliers WHERE id=${id} FOR UPDATE`;
      if (!supplier) throw new Error('delete_not_found');
      if (supplier.name.normalize('NFKC').trim() !== confirmName) throw new Error('delete_confirmation');
      const [counts] = await tx.$queryRaw<{product_count: bigint; history_count: bigint}[]>`SELECT
        ((SELECT COUNT(*) FROM supplier_products WHERE supplier_id=${id})+(SELECT COUNT(*) FROM commerce_product_suppliers WHERE supplier_id=${id})) AS product_count,
        ((SELECT COUNT(*) FROM supplier_orders WHERE supplier_id=${id})+(SELECT COUNT(*) FROM commerce_order_suppliers WHERE supplier_id=${id})+(SELECT COUNT(*) FROM commerce_supplier_accruals WHERE supplier_id=${id})) AS history_count`;
      if (Number(counts?.product_count || 0) > 0) throw new Error('delete_products_first');
      if (Number(counts?.history_count || 0) > 0) throw new Error('delete_history');
      await tx.$executeRaw`DELETE FROM supplier_oauth_states WHERE supplier_id=${id}`;
      await tx.$executeRaw`DELETE e FROM supplier_webhook_events e JOIN supplier_connections c ON c.id=e.connection_id WHERE c.supplier_id=${id}`;
      await tx.$executeRaw`DELETE FROM supplier_connections WHERE supplier_id=${id}`;
      await tx.$executeRaw`DELETE FROM supplier_onboarding WHERE supplier_id=${id}`;
      await tx.$executeRaw`DELETE FROM supplier_integration_profiles WHERE supplier_id=${id}`;
      await tx.$executeRaw`DELETE FROM commerce_suppliers WHERE id=${id}`;
      await tx.admin_log.create({data:{admin_id:BigInt(session.uid),action:'حذف مورد نهائياً',target:id.toString(),note:`المورد=${supplier.name}; تأكيد مزدوج؛ بلا منتجات أو سجل طلبات`}});
    });
  } catch (error) { deleteRedirect(error); }
  revalidatePath('/admin/suppliers');revalidatePath('/admin/suppliers/catalog');revalidatePath('/admin/suppliers/integrations');
  redirect('/admin/suppliers?deleted=supplier');
}

'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAction } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { parseSupplier, parseSupplierProduct } from '@/lib/commerce/supplier-input';
import { assertCommerceSchemaReady } from '@/lib/commerce/schema';

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

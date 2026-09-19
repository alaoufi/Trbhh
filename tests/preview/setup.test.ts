import { it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { CATEGORY_SEED_TEMPLATES } from '@/lib/ad-categories/seed-templates';
import { CATEGORY_DDL } from '@/lib/ad-categories/schema';
import { assertCommerceSchemaReady } from '@/lib/commerce/schema';

it('seeds only an empty dedicated loopback preview with synthetic accounts', async () => {
  if (process.env.COMMERCE_PREVIEW_FIXTURE !== '1') throw new Error('Explicit fixture opt-in required');
  const url = new URL(process.env.DATABASE_URL || '');
  if (url.hostname !== '127.0.0.1' || url.port !== '33309' || url.pathname !== '/trbhh_commerce_preview_20260919') throw new Error('Refusing non-isolated preview DB');
  const db = new PrismaClient({ datasourceUrl: url.href });
  try {
    expect(await db.users.count()).toBe(0);
    expect(await db.ads.count()).toBe(0);
    // Prisma cannot express MySQL collations; restore the commerce DDL's strict
    // identifier collation on this EMPTY, disposable db-push fixture only.
    for (const table of ['commerce_products', 'commerce_orders', 'commerce_order_items', 'commerce_payment_attempts', 'commerce_notifications', 'commerce_audit_events']) {
      await db.$executeRawUnsafe(`ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    }
    for (const ddl of CATEGORY_DDL) await db.$executeRawUnsafe(ddl);
    await assertCommerceSchemaReady(db);
    const password = await bcrypt.hash('Preview-only-2026!', 4);
    for (const [id, role] of [[1, 'admin'], [2, 'member']] as const) {
      await db.users.create({ data: { id: BigInt(id), userName: `commerce-preview-${role}`, name: `تجربة ${role}`,
        phoneNumber: `050000000${id}`, password, type: 'user', is_admin: id === 1 ? 1 : 0, auth_session_version: randomUUID(), country_id: 1 } });
    }
    await db.countries.create({ data: { id: 1, name: 'السعودية', key: '966' } });
    await db.cities.create({ data: { id: 1n, name: 'الرياض', country_id: 1 } });
    await db.areas.create({ data: { id: 1n, name: 'الرياض', city_id: 1 } });
    const cats = new Map<string, bigint>();
    for (const seed of CATEGORY_SEED_TEMPLATES) {
      let categoryId = cats.get(seed.categoryName);
      if (!categoryId) {
        const cat = await db.categories.create({ data: { name: seed.categoryName, photo_path: '', is_active: 'yes' } });
        categoryId = cat.id; cats.set(seed.categoryName, categoryId);
      }
      const sub = await db.sub_categories.create({ data: { name: seed.name, category_id: Number(categoryId), active: 1 } });
      await db.$executeRaw`INSERT INTO ad_category_definitions (subcategory_id,version,kind,price_enabled,goods_enabled,fields_json) VALUES (${sub.id},1,${seed.kind},${Number(seed.priceEnabled)},${Number(seed.goodsEnabled)},${JSON.stringify(seed.fields)})`;
      if (seed.key === 'job') {
        // Prisma's active enum maps to the database value '1'.
        const ad = await db.ads.create({ data: { title: 'وظيفة محاسب — إعلان اختبار محلي', detail: 'فرصة عمل تجريبية للتحقق من عرض حقول الوظيفة دون حالة سلعة أو سعر بيع.', adsType: 'offer', user_id: 2n, city_id: 1n, category_id: categoryId, subcategory_id: Number(sub.id), video_path: '', adsSpecial: 'no', status: 1, state: 'active', created_at: new Date() } });
        await db.$executeRaw`INSERT INTO ad_category_values (ad_id,subcategory_id,definition_version,values_json) VALUES (${ad.id},${sub.id},1,${JSON.stringify({ job_title: 'محاسب', contract: 'دوام كامل', salary_min: 6000, workplace: 'حضوري' })})`;
      }
    }
    for (const [k, v] of Object.entries({ categories_v2_enabled: '1', commerce_enabled: '1', commerce_payments_enabled: '0', commerce_notifications_enabled: '0', commerce_shipping_terms: 'شروط توصيل اختبارية محلية', commerce_shipping_fee_sar: '0.00', auth_require_admin_mfa: '0', schedule_on: '0' })) {
      await db.site_settings.upsert({ where: { k }, create: { k, v }, update: { v } });
    }
    await db.$executeRaw`INSERT INTO commerce_products (title,price_minor,stock_available,approved,visible,enabled) VALUES ('سلعة اختبار محلي فقط',1025,10,1,1,1)`;
  } finally { await db.$disconnect(); }
}, 60000);

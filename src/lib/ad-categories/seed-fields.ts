import { prisma } from '@/lib/prisma';
import { CATEGORY_SEED_TEMPLATES } from './seed-templates';
import { validateDefinition } from './validation';

/**
 * تعبئة حقول الأقسام الفرعية **الفارغة** من القوالب النظامية المطابقة بالاسم —
 * تلقائياً مرّة واحدة عند الإقلاع (بعلامة category_fields_seeded_v1 تمنع التكرار)،
 * وغير متلفة إطلاقاً: تملأ فقط ما لا تعريف حقول له (version<1)، ولا تمسّ أي قسم
 * عُرّفت حقوله فعلاً، ولا تُنشئ أو تُغيّر أي قسم أو قسم فرعي.
 */
export async function seedEmptyCategoryFields(): Promise<number> {
  const { getSetting, setSetting } = await import('@/lib/settings');
  if ((await getSetting('category_fields_seeded_v1', '').catch(() => '1')) === '1') return 0;

  const subs = await prisma.$queryRaw<{ id: bigint; name: string; category_id: number; cat_name: string; ver: number | null }[]>`
    SELECT s.id, s.name, s.category_id, c.name AS cat_name, d.version AS ver
    FROM sub_categories s
    JOIN categories c ON c.id = s.category_id
    LEFT JOIN ad_category_definitions d ON d.subcategory_id = s.id`;

  let filled = 0;
  for (const s of subs) {
    if ((s.ver ?? 0) > 0) continue; // عُرّفت حقوله — لا نمسّه
    const tpl = CATEGORY_SEED_TEMPLATES.find((t) => t.categoryName === s.cat_name && t.name === s.name);
    if (!tpl) continue; // لا قالب مطابق بالاسم — يبقى كما هو ليعرّفه الأدمن يدوياً
    try {
      const fields = validateDefinition(tpl.fields.map((f, i) => ({ ...f, order: i })));
      await prisma.$executeRaw`INSERT INTO ad_category_definitions(subcategory_id,version,kind,price_enabled,goods_enabled,fields_json)
        VALUES (${s.id},1,${tpl.kind},${Number(tpl.priceEnabled)},${Number(tpl.goodsEnabled)},${JSON.stringify(fields)})
        ON DUPLICATE KEY UPDATE
          kind=IF(version<1,VALUES(kind),kind),
          price_enabled=IF(version<1,VALUES(price_enabled),price_enabled),
          goods_enabled=IF(version<1,VALUES(goods_enabled),goods_enabled),
          fields_json=IF(version<1,VALUES(fields_json),fields_json),
          version=IF(version<1,1,version)`;
      filled++;
    } catch (e) {
      console.error('[seed-fields] skip', s.name, e);
    }
  }
  await setSetting('category_fields_seeded_v1', '1').catch(() => {});
  return filled;
}

import { prisma } from '@/lib/prisma';
import { CATEGORY_SEED_TEMPLATES } from './seed-templates';
import { validateDefinition } from './validation';

/** تطبيع عربي للمطابقة: توحيد الألف/الهمزة/الياء، إزالة التشكيل والتطويل، ضغط المسافات. */
function norm(v: string) {
  return (v || '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

/**
 * تعبئة حقول الأقسام الفرعية **الفارغة** من القوالب النظامية المطابقة بالاسم —
 * تلقائياً مرّة واحدة عند الإقلاع (بعلامة category_fields_seeded_v2)، وغير متلفة:
 * تملأ فقط ما لا تعريف حقول له (version<1)، ولا تمسّ أي قسم عُرّفت حقوله، ولا
 * تُنشئ/تُغيّر أي قسم. المطابقة متسامحة (تطبيع)، وتسجّل غير المطابق للتشخيص.
 */
export async function seedEmptyCategoryFields(): Promise<number> {
  const { getSetting, setSetting } = await import('@/lib/settings');
  if ((await getSetting('category_fields_seeded_v2', '').catch(() => '1')) === '1') return 0;

  const subs = await prisma.$queryRaw<{ id: bigint; name: string; cat_name: string; ver: number | null }[]>`
    SELECT s.id, s.name, c.name AS cat_name, d.version AS ver
    FROM sub_categories s
    JOIN categories c ON c.id = s.category_id
    LEFT JOIN ad_category_definitions d ON d.subcategory_id = s.id`;

  // فهرس القوالب بالاسم المطبّع (الفرعي وحده، والفرعي+الرئيسي للحسم عند التكرار).
  const byName = new Map<string, typeof CATEGORY_SEED_TEMPLATES[number]>();
  const byPair = new Map<string, typeof CATEGORY_SEED_TEMPLATES[number]>();
  for (const t of CATEGORY_SEED_TEMPLATES) {
    byName.set(norm(t.name), t);
    byPair.set(`${norm(t.categoryName)}|${norm(t.name)}`, t);
  }

  let filled = 0;
  const unmatched: string[] = [];
  for (const s of subs) {
    if ((s.ver ?? 0) > 0) continue; // عُرّفت حقوله — لا نمسّه
    const tpl = byPair.get(`${norm(s.cat_name)}|${norm(s.name)}`) || byName.get(norm(s.name));
    if (!tpl) { unmatched.push(`${s.cat_name} / ${s.name}`); continue; }
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
  if (unmatched.length) console.log(`[seed-fields] no matching template for ${unmatched.length}: ${unmatched.slice(0, 40).join(' · ')}`);
  await setSetting('category_fields_seeded_v2', '1').catch(() => {});
  return filled;
}

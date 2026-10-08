import { prisma } from '@/lib/prisma';
import { CATEGORY_SEED_TEMPLATES } from './seed-templates';
import { validateDefinition } from './validation';

/** تطبيع عربي للمطابقة: توحيد الألف/الهمزة/الياء/التاء المربوطة، إزالة التشكيل والتطويل، ضغط المسافات. */
function norm(v: string) {
  return (v || '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

/** هل تعريف الحقول فارغ فعلاً؟ (لا صف، أو نسخة<1، أو JSON فارغ/غير صالح). */
function isEmptyFields(ver: number | null, fj: string | null): boolean {
  if ((ver ?? 0) < 1) return true;
  if (!fj) return true;
  try { const a = JSON.parse(fj); return !Array.isArray(a) || a.length === 0; } catch { return true; }
}

/**
 * تعبئة حقول الأقسام الفرعية **الفارغة** من القوالب النظامية المطابقة بالاسم —
 * تلقائياً مرّة واحدة عند الإقلاع (بعلامة category_fields_seeded_v3)، غير متلفة:
 * تملأ فقط ما حقوله فارغة فعلاً (لا صف/نسخة<1/JSON فارغ)، ولا تمسّ قسماً عُرّفت
 * حقوله، ولا تُنشئ/تُغيّر أي قسم. مطابقة متسامحة (تطبيع + الاسم الفرعي كبديل).
 */
export async function seedEmptyCategoryFields(): Promise<number> {
  const { getSetting, setSetting } = await import('@/lib/settings');
  if ((await getSetting('category_fields_seeded_v3', '').catch(() => '')) === '1') return 0;

  const subs = await prisma.$queryRaw<{ id: bigint; name: string; cat_name: string; ver: number | null; fj: string | null }[]>`
    SELECT s.id, s.name, c.name AS cat_name, d.version AS ver, d.fields_json AS fj
    FROM sub_categories s
    JOIN categories c ON c.id = s.category_id
    LEFT JOIN ad_category_definitions d ON d.subcategory_id = s.id`;

  const byName = new Map<string, typeof CATEGORY_SEED_TEMPLATES[number]>();
  const byPair = new Map<string, typeof CATEGORY_SEED_TEMPLATES[number]>();
  for (const t of CATEGORY_SEED_TEMPLATES) {
    byName.set(norm(t.name), t);
    byPair.set(`${norm(t.categoryName)}|${norm(t.name)}`, t);
  }

  let filled = 0;
  const unmatched: string[] = [];
  for (const s of subs) {
    if (!isEmptyFields(s.ver, s.fj)) continue; // عُرّفت حقوله فعلاً — لا نمسّه
    const tpl = byPair.get(`${norm(s.cat_name)}|${norm(s.name)}`) || byName.get(norm(s.name));
    if (!tpl) { unmatched.push(`${s.cat_name} / ${s.name}`); continue; }
    try {
      const fields = validateDefinition(tpl.fields.map((f, i) => ({ ...f, order: i })));
      await prisma.$executeRaw`INSERT INTO ad_category_definitions(subcategory_id,version,kind,price_enabled,goods_enabled,fields_json)
        VALUES (${s.id},1,${tpl.kind},${Number(tpl.priceEnabled)},${Number(tpl.goodsEnabled)},${JSON.stringify(fields)})
        ON DUPLICATE KEY UPDATE
          kind=VALUES(kind), price_enabled=VALUES(price_enabled), goods_enabled=VALUES(goods_enabled),
          fields_json=VALUES(fields_json), version=IF(version<1,1,version)`;
      filled++;
    } catch (e) {
      console.error('[seed-fields] skip', s.name, e);
    }
  }
  console.log(`[seed-fields] total=${subs.length} filled=${filled} unmatched=${unmatched.length}${unmatched.length ? ' :: ' + unmatched.slice(0, 60).join(' · ') : ''}`);
  await setSetting('category_fields_seeded_v3', '1').catch(() => {});
  return filled;
}

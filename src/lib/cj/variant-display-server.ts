import 'server-only';
import { cjVariantDisplayOptions, type DisplayOption } from './variant-display';
import { translateManyForDisplay } from './translate';
import type { CjVariant } from './types';

/**
 * الإجراء الموحّد لترجمة خيارات المتغيّرات للعرض في كل مكان (التفاصيل، القائمة المنسدلة،
 * لوحة الشراء، السلة). المصدر الوحيد للحقيقة: cjVariantDisplayOptions يستخرج التسميات/القيم
 * (قاموس محلي أولاً)، ثم نُمرّر ما بقي إنجليزياً عبر خدمة الترجمة نفسها (translateManyForDisplay)
 * المستخدمة في صفحات الإدارة — فلا يبقى أي نص غير مترجم. يُحسب على الخادم مرّة ويُمرَّر جاهزاً
 * للمكوّنات العميلة (قابل للتسلسل: كائنات لا Map).
 */
export type TranslatedVariant = { vid: string; label: string; options: DisplayOption[] };

export async function translateVariantOptions<
  T extends Pick<CjVariant, 'vid' | 'variantKey' | 'variantName' | 'attributes'>,
>(variants: T[], max = 150): Promise<Record<string, TranslatedVariant>> {
  const raw = variants.map((v) => ({ vid: v.vid, options: cjVariantDisplayOptions(v) }));
  const texts = new Set<string>();
  for (const r of raw) for (const o of r.options) { texts.add(o.label); texts.add(o.value); }
  const ar = await translateManyForDisplay([...texts], max).catch(() => new Map<string, string>());
  const tr = (t: string) => ar.get((t || '').trim()) || t;
  const out: Record<string, TranslatedVariant> = {};
  raw.forEach((r, index) => {
    const options = r.options.map((o) => ({ ...o, label: tr(o.label), value: tr(o.value) }));
    const label = options.map((o) => `${o.label}: ${o.value}`).join(' · ') || `الخيار ${index + 1}`;
    if (r.vid) out[r.vid] = { vid: r.vid, label, options };
  });
  return out;
}

import type { CjProductRow } from '../../src/lib/cj/mapping';
import type { AdCard } from '../../src/lib/data';
import type { ApprovedPreview } from '../../src/lib/cj/approved-catalog';

export const fixtureAccountId = 900001;
export const publicJpegAlias = 'https://cf.cjdropshipping.com/quick/product/18cabc1b-057b-4c05-8e1c-c97427953c76.jpg';
export const publicJpeg = 'https://oss-cf.cjdropshipping.com/product/2025/08/13/01/32fa1574-4ee3-4742-b098-f8f390ad7ca0_trans.jpeg';
const origin = 'http://127.0.0.1:4325';
const longReference = `https://example.invalid/fixture-reference/${'long-source-path-'.repeat(30)}?fixture=true`;
const base: CjProductRow = {
  id: 0, cj_product_id: 'LOCAL_FIXTURE_ONLY', cj_variant_id: '', cj_sku: 'FIXTURE-SKU', name: 'Synthetic fixture', name_ar: '',
  source_description: null, display_description_ar: `وصف عربي تجريبي لا يثبت مواصفات أو مخزونًا.\n\nرابط مرجعي طويل لاختبار التنسيق: ${longReference}`,
  trbhh_category: 'بيانات اختبار محلية', source_category: 'Synthetic fixture category', status: 'draft', images: null, details_json: null, availability_json: null, availability_checked_at: null, agent_user_id: null, agent_claimed_at: null,
  hidden: 0, sale_price_override_minor: null, image: '', supplier_cost_minor: 5000, shipping_cost_minor: 1000, other_costs_minor: 0,
  profit_minor: 1234, sale_price_minor: 7234, margin_bps: 2000, currency: 'SAR', commerce_product_id: null, trbhh_variant_id: '', last_sync_at: null,
};

/** Two observed public image/title pairs; every price, description, identity and remaining product is synthetic. */
export const fixtureProducts: CjProductRow[] = [
  { ...base, id: 15, name_ar: 'طابعة ساعي حرارية بلوتوث بدون حبر عالية الوضوح', image: publicJpegAlias, images: JSON.stringify([publicJpegAlias]), sale_price_minor: 12345 },
  { ...base, id: 16, name_ar: 'آلة FlashLabel الحرارية السريعة ذات الوجه الواحد وطابعة ملصقات Kupono واحدة', image: publicJpeg, images: JSON.stringify([publicJpeg]), sale_price_minor: 6789 },
  { ...base, id: 900017, name_ar: 'منتج اصطناعي لاختبار صور المعرض الطويلة والكميات', cj_sku: `FIXTURE-${'A'.repeat(240)}`, image: `${origin}/fixture-image/synthetic-front.svg`, images: JSON.stringify([`${origin}/fixture-image/synthetic-front.svg`, `${origin}/fixture-image/synthetic-back.svg`]), details_json: JSON.stringify({ variants: [{ name: 'Untranslated supplier option', sku: 'TEST-ONLY', priceUsd: 1, weight: 100 }], variantCount: 2, weightMin: 100, weightMax: 200 }), sale_price_minor: 1001 },
  { ...base, id: 900018, name_ar: 'منتج اصطناعي بدون صورة — لا تُستبدل بصورة منتج آخر', image: '', images: null, sale_price_minor: 5099 },
  { ...base, id: 900019, name_ar: 'منتج اصطناعي بصورة معطلة لاختبار رسالة عدم التوفر', image: `${origin}/fixture-image/missing.jpg`, images: null, sale_price_minor: 2099 },
];

export const fixtureCatalogProducts = [...fixtureProducts, ...Array.from({ length: 60 }, (_, index) => ({ ...base, id: 910001 + index, name_ar: `سلعة اصطناعية لاختبار الترقيم ${index + 1}`, sale_price_minor: 1901 + index }))];
export const fixtureAds: AdCard[] = Array.from({ length: 6 }, (_, index) => ({ id: 920001 + index, title: `إعلان عضو اصطناعي ${index + 1}`, price: 123.45 + index, adsType: 'offer', image: '/fixture-image/synthetic-front.svg', cityName: 'مدينة اختبار', categoryName: null, createdAt: null, special: false, urgent: false, views: 0, sellerName: 'عضو اختبار', sellerTrusted: index < 2 }));
export const fixtureApproved: ApprovedPreview[] = [false, true].map((imported, index) => ({ id: String(930001 + index), key: `commerce:${930001 + index}`, title: imported ? 'سلعة مورد معتمدة — بيانات اختبار' : 'سلعة تربح معتمدة — بيانات اختبار', priceMinor: 23456 + index, stock: 2, images: ['/fixture-image/synthetic-front.svg'], description: 'وصف اصطناعي لصفحة المعاينة الخاصة. لا يمثل مخزونًا أو سلعة فعلية.', imported, href: `/cj/approved/${930001 + index}` }));

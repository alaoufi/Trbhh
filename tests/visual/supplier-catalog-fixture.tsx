/** Offline interaction fixture. No database, credentials, Salla or payment calls. */
import { createRoot } from 'react-dom/client';
import { SupplierCatalog } from '../../src/components/supplier-catalog';
import type { CatalogActions, CatalogDetail, CatalogPage, CatalogProduct, CatalogSearch } from '../../src/lib/suppliers/catalog-selection';

const names = ['دلة قهوة عربية نحاسية', 'طقم فناجين نقش تراثي', 'ترمس ضيافة ذهبي', 'مبخرة خشبية يدوية', 'صينية تقديم مستطيلة', 'حافظة تمر من الخوص'];
const products: CatalogProduct[] = names.map((name, index) => ({
  key: `p_${9000001 + index}`, revision: 1, name, sku: `HERITAGE-${index + 1}`,
  supplierKey: 's_700001', supplierName: 'متجر تراثي — بيانات تجريبية', image: `https://catalog-fixture.test/product-${index}.svg`,
  priceMinor: [24500, 8900, 17500, 7500, 12000, 6800][index],
  costMinor: index === 0 ? null : [0, 5500, 10000, 5000, 8000, 3000][index], sellingMinor: null,
  minimumPriceMinor: 0, minimumMarginMinor: 0, quantity: index === 3 ? 0 : 12 + index,
  available: index !== 3, hasOptions: index === 2,
  status: index === 3 ? 'unavailable' : 'imported', statusLabel: index === 3 ? 'نفد المخزون' : 'مستورد — لم يُضف بعد', canSelect: true,
  lastSyncAt: '2026-09-21T12:00:00.000Z',
}));
let approvals = 0;
const pending = () => new Promise(resolve => setTimeout(resolve, 80));
function page(input: CatalogSearch): CatalogPage {
  const q = input.query.trim().toLocaleLowerCase();
  const filtered = products.filter(product => (!q || `${product.name} ${product.sku}`.toLocaleLowerCase().includes(q)) && (!input.supplierKey || product.supplierKey === input.supplierKey));
  return { products: filtered.slice((input.page - 1) * 3, input.page * 3).map(product => ({ ...product })), suppliers: [{ key: 's_700001', name: 'متجر تراثي — بيانات تجريبية' }], page: input.page, hasNext: filtered.length > input.page * 3, query: input.query, supplierKey: input.supplierKey };
}
const actions: CatalogActions = {
  async search(input) { await pending(); return input.query === 'فشل' ? { error: 'تعذر تحميل المنتجات. أعد المحاولة.' } : { data: page(input) }; },
  async details(key) {
    await pending(); const product = products.find(item => item.key === key);
    if (!product) return { error: 'لم يعد المنتج متاحًا.' };
    const detail: CatalogDetail = { ...product, description: 'قطعة مستوحاة من الضيافة السعودية، مصنوعة بعناية للاستخدام اليومي.\nالمقاس: متوسط. العناية: تنظيف يدوي وتجفيف بعد الاستخدام.', images: product.image ? [product.image, 'https://catalog-fixture.test/product-detail.svg'] : [], brand: 'تراث', categories: ['المنزل والضيافة', 'أدوات القهوة'], options: product.hasOptions ? [{ name: 'اللون', values: ['ذهبي', 'نحاسي'] }] : [], variants: product.hasOptions ? [{ name: 'ذهبي', sku: `${product.sku}-G`, priceMinor: product.priceMinor, quantity: 4, available: true, options: { اللون: 'ذهبي' } }] : [], sourceUpdatedAt: product.lastSyncAt };
    return { product: detail };
  },
  async review(selection) {
    await pending(); const selected = selection.map(row => products.find(product => product.key === row.key && product.revision === row.revision && product.canSelect));
    if (selected.some(row => !row)) return { error: 'تغيرت بيانات أحد المنتجات. حدّث النتائج ثم أعد الاختيار.' };
    return { review: { token: 'offline-review-only', expiresAt: new Date(Date.now() + 600000).toISOString(), products: selected.map(row => ({ ...row! })) } };
  },
  async approve(input) {
    await pending();
    if (input.token !== 'offline-review-only' || !input.confirmed || input.products.some(row => !row.cost || Number(row.selling) < Number(row.cost))) return { error: 'راجع التكلفة وسعر البيع قبل التأكيد.' };
    for (const row of input.products) { const product = products.find(item => item.key === row.key)!; product.status = 'added_hidden'; product.statusLabel = 'مضاف إلى تربح — مخفي'; product.canSelect = false; product.revision++; }
    approvals++; return { added: input.products.length };
  },
};
Object.assign(window, { catalogFixture: { approvals: () => approvals, added: () => products.filter(product => product.status === 'added_hidden').length } });
createRoot(document.getElementById('root')!).render(<SupplierCatalog initialData={page({ query: '', supplierKey: '', page: 1 })} actions={actions} exampleState />);

import { fixtureAccountId, fixtureCatalogProducts, fixtureAds, fixtureApproved } from './cj-fixture-data';
import { parseCjCatalogQuery } from '../../src/lib/cj/catalog-feed';
import type { CjCatalogQuery, CjCatalogItem } from '../../src/lib/cj/catalog-feed';
export { CJ_CATALOG_TABS } from '../../src/lib/cj/catalog-feed';
export { parseCjImages, parseCjDetails } from '../../src/lib/cj/mapping';

const blocked = () => { throw Error('CJ_FIXTURE: database, supplier and mutation access are disabled'); };
export const prisma = new Proxy({}, { get: blocked });
export const publicAdSearchWhere = blocked;
export const publicAdCardSelect = {};
export const toPublicAdCards = blocked;
export async function cookies() { return { get: () => undefined }; }
export async function getSession() { return { uid: fixtureAccountId }; }
export async function hasAccess(uid: number, module: string, action = 'view') { return uid === fixtureAccountId && module === 'products' && action === 'view'; }
export async function requireAccess(module: string, action = 'view') { if (!(await hasAccess(fixtureAccountId, module, action))) return blocked(); return getSession(); }
export async function getSetting(_key: string, fallback = '') { return fallback; }
export async function getSettingNum(_key: string, fallback = 0) { return fallback; }
export const setSetting = blocked;
export const upsertCjProduct = blocked;
export async function listStorefrontCjProducts(readyOnly: boolean, limit = 120) { return fixtureCatalogProducts.filter(row => row.hidden === 0 && (!readyOnly || row.status === 'ready')).slice(0, limit); }
export async function getStorefrontCjProduct(id: number, readyOnly: boolean) { return (await listStorefrontCjProducts(readyOnly)).find(row => row.id === id) || null; }
export async function cjProductOrderCount() { return 0; }
export async function isActiveAgent() { return false; }
export async function getAgent() { return null; }
export function agentContactLinks() { return null; }
export async function cjProductCapabilities() { return { agent: false, edit: false, suspend: false, delete: false }; }
export async function cjStorefrontView() { return { visible: true, isPublic: false, isStaff: true }; }
export async function cjStorefrontPublic() { return false; }
export const saveCjStorefrontEdit = blocked;
export const hideCjStorefront = blocked;
export const deleteCjStorefront = blocked;
export function notFound(): never { throw Error('CJ_FIXTURE_NOT_FOUND'); }
export function redirect(): never { throw Error('CJ_FIXTURE_REDIRECT_BLOCKED'); }

/** Synthetic catalog reader only; production query behavior is tested separately. */
export async function loadCjCatalog(query: CjCatalogQuery) {
  const { tab, page: wanted } = parseCjCatalogQuery(query);
  const products: CjCatalogItem[] = tab === 'all' || tab === 'imported' ? fixtureCatalogProducts.map(product => ({ source: 'cj', key: `cj:${product.id}`, product })) : [];
  const approved: CjCatalogItem[] = ['all', 'imported', 'trbhh'].includes(tab) ? fixtureApproved.filter(row => tab !== 'imported' || row.imported).map(product => ({ source: 'commerce', key: product.key, product })) : [];
  const ads: CjCatalogItem[] = ['all', 'members', 'verified'].includes(tab) ? fixtureAds.filter(ad => tab !== 'verified' || ad.sellerTrusted).map(ad => ({ source: 'ad', key: `ad:${ad.id}`, ad })) : [];
  const items = [...products, ...approved, ...ads]; const pageCount = Math.max(1, Math.ceil(items.length / 24)); const page = Math.min(wanted, pageCount);
  return { tab, page, pageCount, total: items.length, items: items.slice((page - 1) * 24, page * 24) };
}
export async function getApprovedPreview(id: string) { return fixtureApproved.find(row => row.id === id) ?? null; }
export const countApprovedCatalog = blocked;
export const listApprovedCatalog = blocked;

export async function verifyCjVariantForSaudi(_pid: string, selected: {vid:string;variantSku?:string;variantName?:string|null;variantKey?:string|null}, quantity: number) {
  return { status:'available', vid:selected.vid, sku:selected.variantSku||'FIXTURE-VID', variantName:selected.variantName||null, optionKey:selected.variantKey||null,
    stockQuantity:5, priceChanged:false, warehouses:[{id:'fixture-wh',name:'مستودع اختبار',quantity:5,originCountry:'CN'}], supplierPriceMinor:3000, salePriceMinor:5000,
    shippingOptions:[{name:'شحن اختبار',priceMinor:1000,additionalMinor:0,currency:'SAR',deliveryDays:'7-12',originCountry:'CN'}], checkedAt:new Date().toISOString() };
}
export async function quoteCjVat(unitMinor:number,quantity:number,shippingMinor:number) { return {enabled:false,vatMinor:0,totalMinor:unitMinor*quantity+shippingMinor}; }

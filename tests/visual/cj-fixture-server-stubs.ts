import { fixtureAccountId, fixtureProducts } from './cj-fixture-data';
export { parseCjImages, parseCjDetails } from '../../src/lib/cj/mapping';

const blocked = () => { throw Error('CJ_FIXTURE: database, supplier and mutation access are disabled'); };
export const prisma = new Proxy({}, { get: blocked });
export async function getSession() { return { uid: fixtureAccountId }; }
export async function hasAccess(uid: number, module: string, action = 'view') { return uid === fixtureAccountId && module === 'products' && action === 'view'; }
export async function requireAccess(module: string, action = 'view') { if (!(await hasAccess(fixtureAccountId, module, action))) return blocked(); return getSession(); }
export async function getSetting(_key: string, fallback = '') { return fallback; }
export const setSetting = blocked;
export async function listStorefrontCjProducts(readyOnly: boolean, limit = 120) { return fixtureProducts.filter(row => row.hidden === 0 && (!readyOnly || row.status === 'ready')).slice(0, limit); }
export async function getStorefrontCjProduct(id: number, readyOnly: boolean) { return (await listStorefrontCjProducts(readyOnly)).find(row => row.id === id) || null; }
export async function cjProductOrderCount() { return 0; }
export async function isActiveAgent() { return false; }
export async function getAgent() { return null; }
export function agentContactLinks() { return null; }
export const saveCjStorefrontEdit = blocked;
export const hideCjStorefront = blocked;
export const deleteCjStorefront = blocked;
export function notFound(): never { throw Error('CJ_FIXTURE_NOT_FOUND'); }
export function redirect(): never { throw Error('CJ_FIXTURE_REDIRECT_BLOCKED'); }

import 'server-only';
import { calculateFreightToKSA, getInventoryByPid } from './client';
import type { CjVariant } from './types';

export type AvailabilityDeps = {
  getInventoryByPid?: typeof getInventoryByPid;
  calculateFreight?: typeof calculateFreightToKSA;
};

/** Read-only CJ stock + Saudi freight proof. Missing or partial responses fail closed. */
export async function readCjAvailability(pid: string, variants: CjVariant[], deps: AvailabilityDeps = {}): Promise<string | null> {
  const eligible = variants.filter(variant => !!variant.vid);
  if (!eligible.length || eligible.length > 100) return null;
  const inventory = await (deps.getInventoryByPid ?? getInventoryByPid)(pid).catch(() => null);
  if (!inventory?.ok) return null;
  const rowsByVid = new Map<string, typeof inventory.data>();
  for (const row of inventory.data) rowsByVid.set(row.vid, [...(rowsByVid.get(row.vid) ?? []), row]);
  const stockByOrigin = new Map<string, Map<string, number>>();
  for (const variant of eligible) for (const row of rowsByVid.get(variant.vid) ?? []) {
    const origin = row.countryCode?.trim().toUpperCase();
    if (!origin || !/^[A-Z]{2}$/.test(origin)) continue;
    const quantity = Math.max(0, row.storageNum);
    if (!quantity) continue;
    const products = stockByOrigin.get(origin) ?? new Map<string, number>();
    products.set(variant.vid, (products.get(variant.vid) ?? 0) + quantity);
    stockByOrigin.set(origin, products);
  }
  let stockQuantity = 0;
  const verifiedVariantStock = new Map<string, number>();
  const shippingOptions = [] as { name: string; priceUsd: number; deliveryDays: string | null; originCountry: string }[];
  for (const [originCountry, products] of stockByOrigin) {
    const freight = await (deps.calculateFreight ?? calculateFreightToKSA)([...products.keys()].map(vid => ({ vid, quantity: 1 })), undefined, originCountry).catch(() => null);
    if (!freight?.ok) continue;
    const options = freight.data
      .filter(option => option.logisticName.trim() && Number.isFinite(option.logisticPrice) && option.logisticPrice >= 0)
      .map(option => ({ name: option.logisticName.trim().slice(0, 80), priceUsd: option.logisticPrice, deliveryDays: option.logisticAging?.slice(0, 40) ?? null, originCountry }));
    if (options.length) {
      stockQuantity += [...products.values()].reduce((sum, quantity) => sum + quantity, 0);
      for (const [vid, quantity] of products) verifiedVariantStock.set(vid, (verifiedVariantStock.get(vid) ?? 0) + quantity);
      shippingOptions.push(...options);
    }
  }
  const variantsWithStock = [...verifiedVariantStock].map(([vid, quantity]) => ({ vid, stockQuantity: quantity }));
  return stockQuantity > 0 && shippingOptions.length ? JSON.stringify({ checkedAt: new Date().toISOString(), stockQuantity, variants: variantsWithStock, shippingOptions }) : null;
}

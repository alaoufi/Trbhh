import 'server-only';
import { getProduct as cjGetProduct, getInventoryByPid as cjGetInventory } from './client';
import type { CjInventory, CjProductDetail, CjResult, CjVariant } from './types';

/** Share reads within one detail render only. A new render always reads CJ again. */
export function createCjDetailReads(pid: string, deps: {
  getProduct?: typeof cjGetProduct;
  getInventoryByPid?: typeof cjGetInventory;
} = {}) {
  let product: Promise<CjResult<CjProductDetail>> | undefined;
  let inventory: Promise<CjResult<CjInventory[]>> | undefined;
  const getProduct = () => product ??= (deps.getProduct ?? cjGetProduct)(pid);
  const getInventoryByPid = () => inventory ??= (deps.getInventoryByPid ?? cjGetInventory)(pid);
  const getVariants = async (): Promise<CjResult<CjVariant[]>> => {
    const result = await getProduct();
    return result.ok ? { ok: true, data: result.data.variants } : result;
  };
  return { getProduct, getInventoryByPid, getVariants };
}

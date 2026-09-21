import 'server-only';

/** أنواع مبسّطة لاستجابات CJ التي نستهلكها (قراءة فقط في هذه المرحلة). */

export type CjProductSummary = {
  pid: string;
  productName: string;
  productSku: string;
  sellPrice: number | null;
  productImage: string | null;
  categoryName: string | null;
};

export type CjVariant = {
  vid: string;
  variantSku: string;
  variantName: string | null;
  variantSellPrice: number | null;
  variantImage: string | null;
  variantWeight: number | null;
};

export type CjProductDetail = CjProductSummary & {
  description: string | null;
  variants: CjVariant[];
};

export type CjInventory = {
  vid: string;
  areaId: string | null;
  areaName: string | null;
  countryCode: string | null;
  storageNum: number;
};

export type CjWarehouse = {
  areaId: string;
  areaEnName: string | null;
  countryCode: string | null;
};

export type CjFreightOption = {
  logisticName: string;
  logisticPrice: number;
  logisticAging: string | null;
  logisticPriceCn: number | null;
};

export type CjTrack = {
  trackNumber: string;
  logisticName: string | null;
  trackStatus: string | null;
  details: { date: string | null; description: string | null }[];
};

/** نتيجة موحّدة لاستدعاءات CJ (لا ترمي؛ نميّز النجاح من الفشل). */
export type CjResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

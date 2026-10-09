import 'server-only';

/** أنواع مبسّطة لاستجابات CJ التي نستهلكها (قراءة فقط في هذه المرحلة). */

export type CjProductSummary = {
  pid: string;
  productName: string;
  productSku: string;
  sellPrice: number | null;
  productImage: string | null;
  productImages?: string[];
  categoryName: string | null;
};

export type CjVariant = {
  vid: string;
  variantSku: string;
  variantName: string | null;
  variantKey?: string | null;
  variantSellPrice: number | null;
  variantImage: string | null;
  variantWeight: number | null;
  /** Original variant API properties, kept so new provider options survive imports. */
  attributes?: Record<string, unknown>;
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
  /** Quantity stocked by CJ itself (factory inventory is not sale-ready stock). */
  cjInventoryQuantity?: number;
  verifiedWarehouse?: number | null;
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
  taxesFeeUsd?: number | null;
  clearanceFeeUsd?: number | null;
  totalPostageFeeUsd?: number | null;
};

export type CjTrack = {
  trackNumber: string;
  logisticName: string | null;
  trackStatus: string | null;
  details: { date: string | null; description: string | null }[];
};

/** تصنيف CJ (مسطَّح للمستوى الثالث مع مساره الكامل) — للفلترة. */
export type CjCategory = {
  id: string;         // معرّف التصنيف (المستوى الثالث) المستخدَم في فلترة /product/list
  name: string;       // اسم التصنيف الأخير
  path: string;       // المسار الكامل: الأول › الثاني › الثالث
};

/** صفحة منتجات مع الإجمالي — لتصفّح آلاف السلع بكفاءة. */
export type CjProductPage = {
  items: CjProductSummary[];
  total: number;
  pageNum: number;
  pageSize: number;
};

/** نتيجة موحّدة لاستدعاءات CJ (لا ترمي؛ نميّز النجاح من الفشل). */
export type CjResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

/** رصيد محفظة CJ (بالدولار) — getBalance. */
export type CjBalance = {
  amountUsd: number;        // الرصيد القابل للاستخدام
  bonusUsd: number;         // رصيد مكافآت غير قابل للسحب (noWithdrawalAmount)
  frozenUsd: number;        // رصيد مجمّد (freezeAmount)
};

/** نتيجة إنشاء طلب CJ عبر createOrderV2 (payType=3: إنشاء بلا دفع). */
export type CjCreatedOrder = {
  orderId: string;              // معرّف الطلب لدى CJ (للدفع عبر payBalance وللاستعلام)
  orderNumber: string | null;   // رقمنا المرسَل (orderNumber = internal_ref)
  shipmentOrderId: string | null; // لـ payBalanceV2 عند تعدّد الطلبات الفرعية
  actualPaymentUsd: number | null; // المبلغ الفعلي المطلوب من CJ (للتحقق من السقف)
  orderStatus: string | null;   // حالة CJ الخام عند الإنشاء
};

/** تفاصيل طلب CJ عبر getOrderDetail — للاستطلاع الدوري وتطبيق الحالة. */
export type CjOrderDetail = {
  orderId: string;
  orderNum: string | null;      // رقمنا (orderNumber)
  cjOrderId: string | null;
  orderStatus: string | null;   // الحالة الخام
  subStatus: string | null;
  trackNumber: string | null;
};

/** عيّنة منتج تفصيلية للقراءة فقط — تجمع الملخّص + المتغيّرات + المخزون. */
export type CjSampleVariant = {
  vid: string;
  sku: string;
  name: string | null;
  priceUsd: number | null;
  weight: number | null;
  stock: number | null;
};
export type CjSampleProduct = {
  pid: string;
  sku: string;
  name: string;
  category: string | null;
  priceUsd: number | null;
  images: string[];
  variants: CjSampleVariant[];
  totalStock: number;
};

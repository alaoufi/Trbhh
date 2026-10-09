import 'server-only';

/**
 * واجهة مورد موحّدة لمتجر تربح — تعزل منطق المتجر عن تفاصيل أي مورد (CJ أو غيره).
 * كل مورد يعلن «قدراته» (capabilities) صراحةً؛ لا نفترض أن جميع الموردين يدعمون كل
 * وظيفة. إضافة مورد جديد = تنفيذ CommerceSupplier وتسجيله، دون تعديل بقية المتجر.
 *
 * ملاحظة التصميم: هذه الواجهة أعلى طبقة رقيقة تلتفّ على دوال المورد القائمة (لا تعيد
 * بناءها)؛ تكامل CJ الحالي يبقى كما هو، وهذه الواجهة هي الواجهة الموحّدة للمستقبل.
 */

/** القدرات المدعومة لكل مورد — تُفحَص قبل عرض/تنفيذ أي وظيفة في المتجر. */
export type SupplierCapabilities = {
  key: string;                 // معرّف المورد الثابت (مثل 'cj')
  label: string;               // اسم العرض
  liveProducts: boolean;       // جلب المنتجات/المتغيّرات
  livePrice: boolean;          // تحقّق السعر الحيّ
  liveStock: boolean;          // تحقّق المخزون الحيّ
  liveShipping: boolean;       // خيارات/تكاليف الشحن الحيّة
  createOrder: boolean;        // إنشاء طلب لدى المورد
  walletPay: boolean;          // السداد من رصيد محفظة المورد
  directPayLink: boolean;      // رابط سداد مباشر رسمي لكل طلب (false ما لم تثبته الواجهة)
  tracking: boolean;           // تتبّع الشحن
};

/** نتيجة موحّدة (لا ترمي؛ تميّز النجاح من الفشل مع رمز خطأ مستقر). */
export type SupplierResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type SupplierVariantQuote = {
  vid: string; sku: string;
  supplierPriceMinor: number;  // تكلفة المورد (بعملة المتجر minor)
  salePriceMinor: number;      // سعر البيع المحسوب
  stockQuantity: number;
  shippingOptions: { name: string; priceMinor: number; additionalMinor: number; deliveryDays: string | null; originCountry: string }[];
  checkedAt: string;           // وقت التحقق (مصدر: المورد حيّ)
  priceChanged: boolean;
};

export type SupplierCreatedOrder = { orderId: string; shipmentOrderId: string | null; actualAmountMinor: number | null; rawStatus: string | null };
export type SupplierOrderStatus = { orderId: string; rawStatus: string | null; trackNumber: string | null };

/** الواجهة الموحّدة التي يحقّقها كل مورد. الدوال غير المدعومة تُعيد خطأ 'unsupported'. */
export interface CommerceSupplier {
  readonly capabilities: SupplierCapabilities;
  /** تحقّق حيّ (سعر/مخزون/شحن) لمتغيّر معيّن إلى عنوان سعودي. */
  verifyVariant(input: { pid: string; vid: string; quantity: number; zip?: string }): Promise<SupplierResult<SupplierVariantQuote>>;
  /** إنشاء طلب لدى المورد بلا دفع (محجوب بحارسي الشراء على مستوى المورد). */
  createOrder(input: Record<string, unknown>): Promise<SupplierResult<SupplierCreatedOrder>>;
  /** رصيد محفظة المورد (بالعملة الأصلية minor) إن كان walletPay مدعوماً. */
  walletBalanceMinor(): Promise<SupplierResult<number>>;
  /** استعلام حالة طلب لدى المورد (للتتبّع/المزامنة). */
  orderStatus(orderId: string): Promise<SupplierResult<SupplierOrderStatus>>;
}

const registry = new Map<string, CommerceSupplier>();
/** يسجّل مورداً تحت مفتاحه. يُستدعى مرة عند تحميل وحدة المورد. */
export function registerCommerceSupplier(supplier: CommerceSupplier): void {
  registry.set(supplier.capabilities.key, supplier);
}
/** يعيد مورداً مسجّلاً بمفتاحه، أو null إن لم يُسجّل. */
export function getCommerceSupplier(key: string): CommerceSupplier | null {
  return registry.get(key) ?? null;
}
/** قائمة الموردين المسجّلين وقدراتهم (للوحة الإدارة/الفحص). */
export function listSupplierCapabilities(): SupplierCapabilities[] {
  return [...registry.values()].map((s) => s.capabilities);
}

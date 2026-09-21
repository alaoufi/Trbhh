/** Provider-neutral DTOs. Tokens and raw provider responses never belong here. */
export const SUPPLIER_PROVIDERS = ['salla','cj','other'] as const;
export type SupplierProvider = typeof SUPPLIER_PROVIDERS[number];
export type SupplierMode = 'development'|'live';
export type SupplierConnectionStatus = 'disconnected'|'connected'|'reconnect_required';
export type SupplierPricingPolicy = 'manual'|'source'|'fixed_discount'|'percent_discount';
export type SupplierOrderStatus = 'awaiting_payment'|'pending'|'sending'|'submitted'|'unknown'|'simulated'|'blocked'|'cancelled';
export type SupplierWebhookStatus = 'pending'|'processing'|'done'|'failed';
export type SupplierIntegrationPolicy = {
  supplierId:bigint;provider:SupplierProvider;maintenance:boolean;syncEnabled:boolean;
  autoOrdersEnabled:boolean;mode:SupplierMode;
};
export type SupplierVariant = {
  externalId:string;sku:string;name:string;publicPriceMinor:number|null;
  quantity:number|null;available:boolean;options:Record<string,string>;
};
export type SupplierOption = {externalId:string;name:string;values:readonly string[]};
export type SupplierCategory = {externalId:string;name:string};
export type SupplierProduct = {
  externalId:string;sku:string;name:string;description:string;images:readonly string[];
  variants:readonly SupplierVariant[];options:readonly SupplierOption[];
  categories:readonly SupplierCategory[];brand:string;publicPriceMinor:number;currency:'SAR';
  quantity:number|null;available:boolean;sourceUpdatedAt:string|null;
};
export type SupplierShipment = {
  externalId:string;carrier:string;trackingNumber:string;status:string;
  fulfillmentStatus:string;sourceUpdatedAt:string|null;
};
export type SupplierOrder = {
  externalId:string;status:string;paymentStatus:string;currency:'SAR';
  payableMinor:number;shipments:readonly SupplierShipment[];sourceUpdatedAt:string|null;
};
export type SupplierOrderRequest = {
  idempotencyKey:string;merchantOrderId:string;currency:'SAR';shippingMinor:number;
  items:readonly {externalId:string;variantId?:string;hasVariants?:boolean;name?:string;sku?:string;variantName?:string;quantity:number;unitCostMinor:number}[];
  shipping:{name:string;phone:string;addressLine:string;city:string;postalCode:string;country:'SA'};
  shippingNotes?:string;
};
export type SupplierCreateOrderResult =
  | {status:'submitted';externalOrderId:string;externalOrderUrl:string;externalCustomerId:string}
  | {status:'simulated';externalOrderId:null}
  | {status:'unknown';externalOrderId:null;errorCode:string};
/** Implementations own private credentials. Callers enforce durable claims, RBAC,
 * paid-receipt prerequisites and live-mode gates before invoking createOrder.
 * Passing an idempotency key does NOT assert that upstream supports safe retries. */
export interface SupplierAdapter {
  readonly provider:SupplierProvider;
  getProducts(input?:{cursor?:string|null;limit?:number;updatedSince?:string|null}):Promise<{products:SupplierProduct[];nextCursor:string|null}>;
  getProduct(externalId:string):Promise<SupplierProduct|null>;
  getOrder(externalId:string):Promise<SupplierOrder|null>;
  createOrder(request:SupplierOrderRequest):Promise<SupplierCreateOrderResult>;
}

import type {PrismaClient} from '@prisma/client';

export type CommerceDb = Pick<PrismaClient, '$transaction' | '$queryRaw'>;
export type OrderStatus = 'building' | 'awaiting_payment' | 'paid' | 'cancelled';
export type AttemptStatus = 'creating' | 'pending' | 'uncertain' | 'paid';
export type NotificationChannel = 'in_app' | 'sms' | 'whatsapp' | 'email' | 'push';
export type NotificationTarget = {recipient: string; channel: NotificationChannel};
export type OrderLineInput = {productId: bigint; quantity: number};
export type ShippingSnapshot = {name: string; phone: string; addressLine: string; city: string; postalCode: string; country: 'SA'};
export type CreateOrderInput = {memberId: bigint; requestKey: string; items: readonly OrderLineInput[]; shipping: ShippingSnapshot};
/** Trusted server configuration, NEVER browser fields. Fee must be explicit, including zero. */
export type OrderPolicy = {shippingFeeMinor: number};
export type OrderItemSnapshot = {productId: bigint; title: string; quantity: number; unitPriceMinor: number; totalMinor: number};
export type OrderSnapshot = {id: bigint; memberId: bigint; status: OrderStatus; currency: 'SAR'; subtotalMinor: number; shippingFeeMinor: number; totalMinor: number; shipping: ShippingSnapshot; items: OrderItemSnapshot[]};
export type PaymentAttempt = {id: bigint; orderId: bigint; provider: string; reference: string | null; redirectUrl: string | null; merchantOrderId: string; amountMinor: number; currency: 'SAR'; status: AttemptStatus};
export type PaymentClaim = {claimed: true; claimToken: string; attempt: PaymentAttempt} | {claimed: false; attempt: PaymentAttempt};
export type ExpectedPayment = {amountMinor: number; currency: string; reference: string; merchantOrderId: string; provider: string};
/** Only a server adapter's authenticated verification result may reach settlement.
 * This runtime shape does NOT authenticate a callback or authorize the caller. */
export type VerifiedPayment = ExpectedPayment & {verified: boolean; status: string};

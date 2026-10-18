import { randomUUID } from 'node:crypto';

/** Operational evidence only. Repeated purchases may share this source reference:
 * money_ref is indexed, not unique, and provides neither debit idempotency nor tax approval. */
export type WalletSourceReference = {
  kind: 'ad' | 'store' | 'classified' | 'member_service_order' | 'package';
  id: number | bigint;
  service: 'featured' | 'urgent' | 'bump' | 'ad_show' | 'classified' | 'subscription' | 'store_plus' | 'store_show' | 'member_service';
} | {
  kind: 'operation';
  id: string;
  service: 'classified_publish' | 'classified_reactivate' | 'identity_subscription' | 'sale_deposit';
};

/** A local attempt ID, generated once before debit and shared with any existing failure refund.
 * It is not a persisted advertisement/order ID, external payment ID, invoice, or retry key. */
export function newWalletOperationReference(service: Extract<WalletSourceReference, { kind: 'operation' }>['service']): WalletSourceReference {
  return { kind: 'operation', id: randomUUID(), service };
}

export function walletSourceReference(source?: WalletSourceReference): string | null {
  if (!source) return null;
  if (source.kind === 'operation' && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(source.id)) return null;
  if (typeof source.id === 'number' && (!Number.isSafeInteger(source.id) || source.id <= 0)) return null;
  if (typeof source.id === 'bigint' && source.id <= 0n) return null;
  const reference = `svc:v1:${source.kind}:${source.id}:${source.service}`;
  return reference.length <= 80 ? reference : null;
}

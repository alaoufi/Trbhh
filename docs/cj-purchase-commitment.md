# CJ purchase commitment — P0 blocked

Account requested by administrator: CJ5840611. A read-only MCP login check on
2026-10-13 authenticated successfully; both the authenticated reply and configured
identifier match CJ5840611. This does not independently prove ownership of the
production application's separate API key. No real order, wallet debit,
customer payment or inventory reservation was performed.

## Observed implementation

- The former low-level implementation used createOrderV2, not V3.
- `{ payType: 3, ...input }` allowed callers to override unpaid creation with payType=2.
- Wallet payment accepted an order ID or shipment ID without an atomic approved-amount condition.
- The coordinator compared a global spending cap, not an immutable order-specific approval.
- It released the lock after ambiguous network failures, permitting a dangerous retry.
- Some supplier-ID and paid-at writes suppressed database errors.
- A successful payment envelope became `paid` and a ledger charge without independently
  proving deducted amount, supplier acceptance or inventory allocation.
- Customer-payment settlement records `offline_pending` and pending supplier orders;
  it does not implement a proven CJ purchase commitment.

## Applied containment

Creation, balance payment and confirmation now fail closed in the common CJ client,
including when both live-order settings are enabled. The administrative payment
coordinator records `cj_purchase_p0_blocked`, returns `purchase_unverified`, and
cannot create, pay, mark paid, or write a charge. Old `paid_at` is not purchase proof.
The existing admin order page explains the blockade. Routes are retained.
No configuration switch bypasses the blockade. No customer sale activation.

## Documentation evidence checked 2026-10-13

Official shopping documentation:
https://developers.cjdropshipping.com/en/api/api2/api/shopping.html

- createOrderV3 supports payType=3 creation without payment.
- Ordinary payBalanceV2 documents shipmentOrderId and optional payId, but no
  expected amount / maximum amount / immutable quotation token.
- payId is named a payment ID; the inspected documentation does not specify an
  exactly-once replay guarantee. A deterministic local string is not such proof.
- Its successful example returns data=null, not debit amount or stock reservation.
- Makeup-payment requests exist separately: later extra charges must be reconciled.

Sandbox documentation:
https://developers.cjdropshipping.com/en/api/start/sandbox.html

Sandbox simulated payment does not debit real balance. It cannot prove live inventory
allocation or the real wallet atomic-amount contract. No sandbox request was executed
in this change, and no account-bound end-to-end success is claimed.

## Blocking acceptance criteria and next steps

P0 remains blocked. Obtain authoritative CJ confirmation/API support for atomic
approved-amount enforcement and idempotent creation/payment reconciliation. Otherwise
unprotected automatic payment must stay disabled, even with administrator approval.

Then implement against the existing order services: immutable approved USD breakdown
(product, route/warehouse shipping, tax, discounts, final total), durable per-order
creation/payment intent before network mutation, query-by-unique-reference before retry,
verified account binding, stored supplier request IDs and sanitized responses, actual
payment reconciliation, explicit acceptance and allocation evidence, and makeup-bill
monitoring. Do not infer allocation from availability or payment status. Unknown outcomes
must remain pending reconciliation with administration notified, never confirmed purchases.

Only after documented guarantees and sandbox failure/concurrency tests pass may an
administrator authorize a bounded real purchase test. Production selling requires a
separate approval. Preserve all customer-payment accounting while supplier fulfillment
is blocked; customer-paid and CJ-purchased are distinct states.

## Validation

27 targeted tests passed: common mutation blockade, both settings enabled, input
payType override, both wallet paths, order confirmation, repeated and concurrent
approvals, legacy paid flags and audit failure. TypeScript check passed.
Full suite: 2526 passed, 9 skipped, with serial workers and testTimeout=30000ms.
The earlier parallel run hit two Prisma subprocess timeouts; no tests were removed.
Lint: 0 errors and 7 existing warnings. Independent P0 containment review passed.
Production build passed (Next.js 16.3.8); build success is not deployment proof.

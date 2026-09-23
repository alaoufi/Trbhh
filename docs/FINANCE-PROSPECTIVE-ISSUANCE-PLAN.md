# Prospective independent invoice lifecycle

Scope: complete the server-owned path from a future order's approved fiscal policy to its immutable invoice and source-derived adjustments. This work does not enable purchasing, payments, supplier orders, OAuth, external refunds, or any provider connection. It makes no legal or electronic-invoicing compliance claim.

1. Preserve V1 snapshots/calculations and historical pending records. Add a nullable V2 calculation policy and an insert-only order fiscal snapshot table through the existing additive schema sync. No backfill, issuer data, rate, or policy defaults.
2. Require an approved effective policy with explicit item/ shipping price basis and rates, uniform catalog scope, discount treatment, line rounding, rollover handling, and an accountable automation delegate. Validate approval and current permissions separately from worker authentication.
3. Calculate with integer halalas, display the payable quote, and capture issuer, customer address, catalog prices, shipping, discounts, supplier allocation, policy provenance and exact totals in the order transaction. Missing policy blocks new checkout. Never silently recalculate paid orders.
4. Issue from the immutable order snapshot plus the verified receipt through a trusted server adapter. Preserve original-sale policy checks, period locks, unique numbering, audit, and retry safety. Receipt recording remains independent of invoice delivery. Historical or policy-boundary exceptions remain visible for review.
5. Derive V2 credits and debit reversals from issued sources with exact allocation of rounding remainders. Reuse customer/admin archive and print views. No browser-submitted fiscal snapshot or arbitrary debit charge.
6. Add a separate private issuance worker credential and host job, disabled when unset, with overlap prevention and counts/status only. Do not install a live timer as part of this patch.

Validation: exact inclusive/exclusive and rounding examples, malformed/unapproved policy and revoked delegate rejection, full isolated-MySQL checkout -> verified receipt -> real issuance adapter -> customer/admin archive -> partial/full credit -> debit reversal, concurrent retries, closed periods, policy rollover, immutable historic rows, additive upgrade/preservation tests, full unit/TypeScript/lint/release checks. Synthetic fixtures are explicit and never production defaults.

Real activation requires approved issuer and tax data, price/shipping/discount/rounding treatment, confirmation that the uniform-rate catalog scope applies, policy-boundary handling, and a named delegate. These inputs do not block implementing or testing disabled support.

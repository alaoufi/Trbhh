# CJ safeguards from Lumi clarification — 2026-10-19

Scope P0: supplier financial evidence and operational follow-up, without real API writes, database writes, payment, refund, scheduler activation or changing purchase flags during validation.

Implemented:
- Normal unpaid creation explicitly sends isSandbox:0 and retains payType:3. Actual payment still requires the existing exact amount/parent/pay ID authorization.
- Known-wallet payments cannot use the card evidence branch. Unavailable billing persists debit_uncertain and wallet_billing_unavailable_manual_review. Reads can later reconcile matching ledger evidence; no automatic repeated debit and no clearing unrelated exception holds.
- CLOSED/CANCELED/CANCELLED creates a review exception, not a completed refund. Paid UNSHIPPED/PENDING/PROCESSING reaches an operational review threshold at48h, preserving established shipment progress and prior holds/conflicts.
- Administration explains incomplete debit evidence, wallet ledger matching, shipment-label limits, extra charges, refund credit evidence and manual escalation. English delegate message/ref links already exist.
- New quote references use deterministic40-character alphanumeric values. Existing saved quote/reference validation and identity remain unchanged.

Preserved existing safeguards verified by tests: amount/FX/source-option/address checks, Saudi short address, CAS concurrency, no repeat creation/parent/debit on uncertain outcomes, source sandbox rejection, signed durable webhook before ACK, authenticated reconciliation with buying disabled, no webhook-direct payment/delivery proof.

Provider clarifications not blindly adopted:
- Current official Shopping API documents billingHistory and balanceHistory, despite Lumi's no-ledger-REST statement. Keep authenticated evidence queries; if account access fails, stop financial confirmation and request portal reconciliation.
- Keep official /api2.0/v1 endpoints and payId/shipmentOrderId, not descriptive aliases from correspondence.
- Keep sign/openId signature verification and assume webhook loss/duplicates; do not depend on claimed at-most-once transport.
- Keep documented UTC string timestamps. Do not interpret arbitrary numeric values as milliseconds without endpoint evidence.

Limits: no new automatic CJ dispute/refund or makeup payment operations. Opening/closing a dispute is not bank/wallet credit proof. No manual ledger-approval bypass was introduced. Physical dispatch and full live customer order roundtrip remain to be verified by the separately authorized first real order. Production polling installation/freshness must be checked after release; code presence is not evidence that its timer runs.

Verification: full suite initial run3548pass/1timeout/9skip; timed-out supplier-selection release29tests passed standalone. Final reference change covered by61focused tests including historical commitment integration; final build/typecheck/lint and full-suite results recorded in task output. Independent review caught and resolved attempted actionRequired mutation that persistence did not support, preserving existing manual holds.

Final verification: final full suite3548 passed,2 subprocess timeouts,9 skipped; both timeout suites then36/36passed sequentially after stopping the prior local image-fixture servers. Final build, TypeScript and scoped ESLint passed. No test assertions/timeouts in source were weakened.

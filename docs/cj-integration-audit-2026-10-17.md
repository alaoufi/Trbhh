# CJ integration review — 2026-10-17

Scope: P0 checks around payment evidence; no real purchase, balance debit, refund, public-store enablement, price update or production deployment.

Verified locally:
- Public product reference is sourced from cj_products.id, kept separate from commerce_products.id, PID and VID; retained through approved quote, commitment, supplier storeProductId/storeLineItemId and customer order snapshot.
- Variant/quantity, destination, warehouse, logistics and payable-amount matching remain required. Payment return URLs and manual legacy paid flags are not independent settlement proof.
- Existing durable claims and reconciliation guard uncertain creates/debits from automatic resubmission. Sandbox probe is separate from order/outbox creation and live financial transport.
- Sandbox evidence is rejected by live fulfillment. Probe hard-codes isSandbox=1 and payType=3, fixed official API origin, limited four endpoints, one create attempt and independent exact order/reference/VID/quantity readback. No simulated payment or status update is requested.
- Public number appears once per product block; source codes remain under expandable reference details. Refresh provenance appears on successful checks, not failed requests.

Evidence: 3210 unit tests passed, 9 skipped; typecheck/lint passed. Next build completed; local production-database runtime checks were not performed (DATABASE_URL unavailable during build). Independent code review found no important defects.

External execution: authenticated CJ connector login checked. Sandbox POST has NOT been sent: browser Hostinger terminals were expired/disconnected, including after attempted reconnect. Prepared standalone script scripts/diagnostics/cj-sandbox-probe.cjs for manual server execution with existing encrypted token, without changing application flags or deployment.

Refund boundary: local customer objection records a fulfillment hold, not a CJ dispute or refund. Legacy manual refunded status is not a transfer receipt. No end-to-end CJ refund-to-wallet/original-payment reconciliation has been exercised or claimed. Approval, actual refund destination and receipt must be confirmed on CJ before considering supplier recovery completed; customer repayment is a separate process.

Primary sources checked:
- https://developers.cjdropshipping.com/en/api/start/sandbox.html
- https://developers.cjdropshipping.com/en/api/api2/api/shopping.html
- https://www.cjdropshipping.com/dispute-policy.html
- https://blog.cjdropshipping.com/detail/1397471340032438273

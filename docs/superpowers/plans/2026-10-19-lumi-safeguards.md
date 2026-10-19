# Lumi safeguards implementation plan — 2026-10-19

P0. User authorizes applying useful provider clarifications, not live purchases, refunds, store activation, speculative endpoint renames, or removal of financial evidence.

- [x] Preserve exact amount/payment identity, single-attempt debit, source/destination verification; explicitly mark normal unpaid order isSandbox:0 +payType:3.
- [x] Persist readable wallet-ledger-unavailable review state, retain uncertain debit/no retry, require ledger for known wallet payments, preserve unrelated holds. No fabricated/manual financial approval.
- [x] Surface CLOSED/CANCELED as review, not refund. Alert paid unshipped 48h with valid source timestamp; preserve tracking progress and existing holds.
- [x] Add operational guidance/English delegate requests for unknown debit, physical-dispatch vs label, refund wallet-credit evidence and extra-charge consent. Keep existing webhook signature and durable-before-ACK handling, authenticated read-only polling.
- [x] Independent P0 review, meaningful regression tests, typecheck, lint/build. Push non-deploy branch only; actual production changes remain a pinned release step.

Official references checked: CJ Shopping /api2.0/v1/shopping routes, isSandbox field, billingHistory + balanceHistory documented. CJ webhook sign/openId and durable event ACK path already implemented. Lumi descriptive aliases are not used as executable API contracts. Order timestamps remain documented UTC strings; no guessed milliseconds conversion.

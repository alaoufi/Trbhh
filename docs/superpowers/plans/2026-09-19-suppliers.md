# Supplier Management and Payment Accounting Plan

Approved by user: complete supplier requirements; API fields optional, activation switch remains off until integration is complete. Continue autonomously in the existing isolated worktree, never deploy.

Design: suppliers are internal counterparties, not customer-facing sellers. Profile activation and API activation are separate. Supplier API endpoint and a dedicated environment-secret reference can be saved without contacting the endpoint; API activation is fail-closed because no provider adapter is registered. No automatic supplier payment. Product-to-supplier terms snapshot at order creation; bank-verified settlement creates an immutable operational receipt and supplier accruals transactionally, once. This is an operational subledger, not a claim of a complete statutory accounting system.

## Contracts

`commerce_suppliers`: id, name, contact_name, phone, email, address, registration_number, tax_number, settlement_terms, notes, active DEFAULT 0, api_base_url, api_credential_ref, api_enabled DEFAULT 0, created_at, updated_at.

`commerce_product_suppliers`: product_id primary key, supplier_id, supplier_sku, unit_cost_minor, currency SAR.

`commerce_order_suppliers`: order_id+product_id unique; supplier_id, supplier_name, supplier_sku, quantity, unit_cost_minor,total_cost_minor. Snapshot immutable even if profile/product terms change. No mapping means internal/unassigned stock, never fabricate a supplier.

`commerce_receipts`: one per order and unique provider/reference; bank verified amount/currency/reference, recorded_at. `commerce_supplier_accruals`: one per order/product supplier snapshot, amount_minor, currency, status offline_pending. No manual paid endpoint; no automatic transfer.

## Tasks

- [x] Core: failing MySQL tests for two suppliers, snapshot retention, inactive supplier rejection, no receipt before bank evidence, repeat settlement and rollback. Implement additive DDL+Prisma and transactional create/settle; retain old fixtures and wallet isolation.
- [x] Input boundary: tests then pure parser for bounded contact fields, HTTPS endpoint without URL credentials/query/fragments/local IP, restricted `TRBHH_SUPPLIER_...` environment reference, explicit toggles. Reject API enable without a reviewed adapter. Never read or expose secret values.
- [x] Admin: independent suppliers RBAC; supplier forms/profile switches/API settings; mapping approved products to suppliers/cost; audit changes without secrets; bounded accounting view with order links and filter. Tests authorization before reads/writes, no external network/API activation.
- [x] Acceptance: run all Vitest, MySQL guards on loopback33309, TypeScript, ESLint, production build. Review changed source/security, original layout and guides. Keep production untouched and API/payment disabled.

Final verification 2026-09-19: 595 unit tests, 53 commerce MySQL tests, 20 category MySQL tests, TypeScript and production build passed. ESLint: zero errors, five existing warnings. Browser: member/admin/public checks passed, no page errors; profile toggles work independently of disabled API; member access and public supplier-data isolation checked. Two independent scoped reviews: no blockers. Prisma generation succeeded sequentially; all seven new foreign keys match Prisma and readiness accepts semantically identical generated names. Supplier and accounting lists paginate at 100 rows with filter retention.

Environment note: pnpm wrapper attempted dependency installation and stopped on a no-TTY purge guard; no purge was approved. Equivalent installed Next.js build command listed below passed. No push, deployment, real payment, external API request, SMS/WhatsApp delivery or production data mutation occurred.

Commands: `node node_modules/vitest/vitest.mjs run`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js .`, `node node_modules/next/dist/bin/next build`. MySQL tests use only explicitly named disposable `trbhh_commerce_test`; never reuse/delete an existing DB.

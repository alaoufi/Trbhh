# CJ prices, VAT control and registration monitoring

> **For agentic workers:** Use subagent-driven-development with separate ownership for display, VAT policy, and the registration monitor. The user authorized execution and safe checkpoints without repeated approval.

**Goal:** Make prices legible, add the five requested catalog tabs, and provide explicit audited VAT control plus a rolling registration monitor without enabling real purchasing.

**Architecture:** Extend the current private CJ experience and approved finance policy workflow. Preserve immutable order/invoice snapshots, RBAC and Maker/Checker. The registration monitor is read-only with respect to VAT activation; its editable threshold is audited separately. No parallel tax engine or rewrite.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/MySQL, integer halala financial calculations, Vitest, existing protected Hostinger release workflow.

## Boundaries and evidence

- Continue from `4df91ca89baef08024f8bde2505ccbf33696eec1` on `codex/cj-storefront-trial-20260924` in the existing isolated worktree.
- Keep the catalog experience private to authorized staff. Adding member advertisements to the private preview must not publish hidden imported products or bypass member/store visibility.
- Keep `commerce_purchasing_enabled=false`, supplier live orders disabled and all payment/order integrations unchanged.
- Defaults: VAT OFF; registration threshold SAR 375,000, editable by authorized administration. Threshold alerts never enable VAT. Enabling VAT requires deliberate authorized policy approval, actual registration confirmation and a valid effective date.
- Use ZATCA's registration rules as the reference, not another country's similarly numbered threshold. Registration includes taxable supplies even when zero-rated; exempt/out-of-scope/capital asset revenue is excluded. Member advertisement asking prices and wallet deposits are not platform taxable turnover.
- References checked 2026-09-24: [implementing regulations, Articles 3 and 4](https://zatca.gov.sa/en/RulesRegulations/Taxes/Documents/Implmenting%20Regulations%20of%20the%20VAT%20Law_EN.pdf) and [electronic contracts guideline, section 7](https://zatca.gov.sa/en/HelpCenter/guidelines/Documents/VAT-Guideline-for-Electronic-Contracts.pdf). The dashboard forecast is an estimate for review, not a registration determination.

## Implementation checkpoints

- [ ] Display: separate price color/weight/size, reused across CJ cards/details and shared store cards; no global theme rewrite.
- [ ] Catalog: الكل / السلع المستوردة / اعلانات الاعضاء / اعلانات موثقة / اعلانات تربح. Reuse authoritative source/verification/official classifications, deterministic pagination and source-qualified keys. Do not mislabel promotion as verification or infer ownership solely from an uploader's admin role.
- [ ] VAT: extend existing approved policy and admin forms with explicit enable state, configured rate and registration/effective-date checks; server authorization, audit before/after/reason/session; preserve historical documents and revalidate new payment attempts against their captured policy.
- [ ] Registration monitor: trailing twelve calendar months, integer amounts, credits/returns and deduplication; expose coverage/source gaps rather than present an incomplete aggregate as complete. Show total, percentage, remaining amount, as-of time and 70/85/95/100 percent alerts. Forecast from an explicitly stated recent sales rate without enabling VAT.
- [ ] Admin wiring and guidance: show monitor/control in the existing tax workspace with read/manage permissions; update relevant guide content without exposing private preview to ordinary members.

## Validation and delivery

- [ ] Write and observe failing behavior tests for calculation/filtering/security changes, then implement and run focused suites.
- [ ] Independent review of VAT historical compatibility, source coverage, roll-window boundaries, forecast limits and visibility/authorization.
- [ ] Commit and push stable stages to the feature branch; never force push or leave finished chunks uncommitted.
- [ ] Run all unit/integration suites, TypeScript, lint and production build. Use isolated CI MySQL and baseline preservation checks; do not claim a DB-less local build passed.
- [ ] Only after exact-SHA gates pass, deliver through the established protected release path with backup/restore/capacity and rollback proof. No public catalog activation.
- [ ] Verify actual serving SHA, authenticated mobile/desktop catalog and admin controls, unauthorized access denial, VAT still OFF and purchase gates unchanged. Report any outstanding source coverage or external dependency honestly.

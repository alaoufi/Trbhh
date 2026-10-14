# Notifications and store action clarity

> For agentic workers: Use subagent-driven-development for independent notification and store domains. Follow TDD and verification before completion.

Goal: Open actionable notifications, distinguish store approval from payment, expose authorized member financial evidence, and keep unpaid routine requests out of the administrative queue.

Architecture: Reuse existing chat, notification, merchant, subscription and wallet services. No new payment system, schema, public CJ activation, charge, or mass customer-state changes. A store moderation decision remains distinct from a paid subscription. Payment proof must come from actual ledger entries, never a positive balance alone.

- [ ] Reproduce message opening/counting issues including missing peers, self/system messages and revoked chat permission. Add regression tests, shared counting/routing policy and full visible reason text. Preserve notification history.
- [ ] Trace pending store creation/approval and subscription payment. Explain real approval requirement separately from trial/paid/expired/unpaid state. Reuse authorized financial ledger view with member filters and actual paid/reserved/available amounts.
- [ ] Reject insufficient funding in existing purchase path without creating a pending admin task. Paid subscription activation remains automatic and transactional/idempotent; no blanket store identity approval.
- [ ] Make administrative queue and banner use the same actionable predicate. Show concrete reason and action, avoiding routine expiry/payment requests.
- [ ] Verify unit/integration, TypeScript, lint and build. Obtain independent P0/P1 review. Push work branch only and attach reviewable PR; production release only with session authorization and verified backup/rollback, preserving CJ activation flags and data.
- [ ] Check rendered notification/store pages and save screenshots after any release. Document exact commit and any remaining account-specific reproduction limitations.

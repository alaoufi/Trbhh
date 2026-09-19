# Salla supplier integration — approved implementation brief

The user's detailed 14-section request authorizes implementation in eight phases. This extends the existing platform; it does not authorize real purchases, Salla app submission, or production deployment during development.

## Audit

Authoritative Git worktree: `repo/.worktrees/commerce`, `alaoufi/Trbhh`, starting at `7dae3d1`. The ambient exported folder has no Git metadata. Production is `021c5fe`; pushing `claude/hostinger-vps-project-amw8vb` automatically deploys. Work is isolated on `codex/salla-integration-20260919`.

Runtime dependencies, rather than the older overview document, identify Next.js 16.3, React 19, TypeScript, Prisma 6, MySQL 8 and Redis. Existing additive DDL lives in `src/data/schema-sync.ts`; supplier profiles and commerce tables already exist. JWT member authentication, `requireAction('suppliers', ...)`, integer-halalah commerce money, immutable supplier order snapshots, verified-payment receipts, and the notification outbox are reused. Existing bank/wallet adapters stay unchanged; the new commerce bank adapter is currently unregistered.

## Selected approach

Extend the existing supplier profile with a separate one-to-one integration policy; keep connections and imported catalog independent from sale-approved `commerce_products`. This avoids a parallel checkout and avoids coupling all suppliers to Salla. CJ and Other are recognized provider types but have no network adapter until separately implemented. No CJ markup rule is applied.

### Persistence

Add `supplier_integration_profiles`, `supplier_connections`, `supplier_oauth_states`, `supplier_products`, `supplier_price_history`, `supplier_price_tiers`, `supplier_stock_reservations`, `supplier_reservation_allocations`, `supplier_orders`, `supplier_shipments`, and `supplier_webhook_events`. Keep existing suppliers, commerce products/order snapshots/receipts as authoritative. Foreign keys restrict deletion; unique keys scope external IDs by connection and provider, and supplier orders by Trbhh order/connection. Source product JSON is bounded and excludes credentials/customer data. No destructive migration.

### Controls and prices

Supplier active, maintenance, sync and automatic-order policies are distinct. Imported products start inactive, hidden, unfeatured and unlinked to a sellable product. Synchronization changes source metadata/public price/stock only. Admin alone sets negotiated cost, final selling price, visibility, enabled and featured state. Explicit pricing application supports source parity, fixed/percentage discount and manual prices with minimum-price/margin guards. All price/cost changes are audited. Publishing uses the existing approved catalog and preserves admin overrides on subsequent syncs.

Prepaid reservations and quantity commitments are distinct records, not bank transfers. Tiers are explicit negotiated contracts. Checkout allocation holds quantity atomically; cancellation releases it, verified settlement consumes it once. Cost/selling/profit are snapshotted, never recomputed for historical orders. Exhausted reservations follow the next eligible reservation then normal-cost policy; insufficient quantities cannot oversell.

### Authentication and network boundaries

Actual Next routes: `/api/integrations/salla/callback`, `/api/integrations/salla/webhooks`, and an authenticated admin connect action. An explicit trusted `SUPPLIER_PUBLIC_ORIGIN` derives the exact callback; never derive it from an untrusted Host header. On trbhh.sa the implemented callback will therefore be `https://trbhh.sa/api/integrations/salla/callback`; it is not live until this branch is deployed.

OAuth uses authorization code, random single-use state tied to initiating admin and an HttpOnly browser nonce, short expiry, and server-side code exchange. Retrieve authenticated merchant identity from User Info, never from callback query input. Access/refresh tokens use AES-256-GCM encryption with a dedicated environment key and connection-bound additional data. Store identity uniqueness prevents cross-supplier attachment. Refresh is serialized with a durable claim; uncertain network outcomes require reconnect, not reuse of a potentially consumed refresh token. Disconnect wipes tokens, preserves historical records and blocks queued work.

Only fixed official Salla hosts/endpoints are used, with redirects prohibited, timeouts, bounded bodies and redacted error codes. Secret values are never sent to admin/client props or logged. No arbitrary supplier URL fetch. Default development mode never calls Salla order creation; a separate explicit server kill switch and per-supplier automatic-orders flag are required for future live order dispatch.

### Synchronization, events and orders

Bounded paginated product sync persists progress/errors and keeps administrator fields intact. Webhooks verify raw-body HMAC-SHA256 before parsing, use merchant-scoped event fingerprints, a durable inbox and retry state. Ignore stale state by reconciling authoritative product/order details; do not trust webhook prices or payment status to mark Trbhh paid. Uninstall disconnects. Periodic reconciliation shares the same worker and locks as manual sync.

Supplier orders are prepared only from a paid Trbhh order with a matching verified receipt. Durable claim and unique keys prevent double dispatch. Without documented upstream idempotency, an ambiguous POST becomes `unknown` and is never automatically resent. Development simulation is explicit and does not pretend to be a real supplier order. Shipments are matched by connection/external order, retained internally, and projected to the owning customer without supplier costs or secrets. Tracking notifications use the existing durable outbox.

## Acceptance

Unit and isolated MySQL tests cover OAuth state/refresh concurrency, provider response mapping, sync/admin overrides, monetary policies, reservation contention, payment prerequisite, duplicate/ambiguous order dispatch, authenticated/duplicate/stale webhook processing, disabled controls and owner-only tracking. Build/typecheck/lint/full existing tests must pass. No production credentials or orders are used. Final handoff must distinguish implemented local endpoints from deployed URLs and real demo-store acceptance from mocked protocol tests.

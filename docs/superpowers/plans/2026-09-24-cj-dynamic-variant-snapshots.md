# CJ dynamic variants and immutable order snapshots

## Scope and invariants

- Retain the real attributes returned by CJ dynamically; render only values that exist and never invent defaults.
- Require a concrete, server-verifiable variant whenever a product has variants or required options.
- Revalidate variant identity, price, inventory, and Saudi shipping at cart quote and order creation.
- Store the selected variant and all chosen attributes as an immutable JSON snapshot on order lines and invoice fiscal lines; expose the same values to customer and admin invoice views.
- Keep Salla/CJ real purchasing and real payment switches unchanged and off. No production deployment in this phase.

## Implementation sequence

1. Extend CJ response parsing and product normalization to preserve arbitrary variant attributes and stable VID/SKU.
2. Add regression tests first for dynamic extraction, selection validation, cart quote, and exact invoice snapshot values.
3. Add additive order-line variant fields and update order/finance/admin/customer read models without breaking supplier accounting relations.
4. Update product detail and cart displays to render arbitrary selected attributes and authoritative variant values.
5. Run focused tests, full unit/integration tests, typecheck, lint, and production build; commit stable checkpoints and push this branch only.

## Data model constraint

Current supplier accrual and supplier order relations intentionally depend on a unique `(order_id, product_id)` order line. Preserve that invariant in this phase; variant identity and its full immutable snapshot are additive fields on the existing product line. If the storefront currently permits two distinct variants of the same product in one order, reject that combination safely until a separately reviewed line-identity migration can update every dependent supplier/finance relation.

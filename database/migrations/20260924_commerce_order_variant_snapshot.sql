-- Additive/backward-compatible: existing order lines remain valid with no selected variant.
-- Apply once on each database before enabling order creation after this release.
ALTER TABLE commerce_order_items
  ADD COLUMN list_unit_price_minor INT NULL AFTER unit_price_minor,
  ADD COLUMN discount_minor INT NOT NULL DEFAULT 0 AFTER list_unit_price_minor,
  ADD COLUMN variant_key VARCHAR(191) COLLATE utf8mb4_bin NOT NULL DEFAULT '' AFTER total_minor,
  ADD COLUMN variant_snapshot JSON NULL AFTER variant_key;

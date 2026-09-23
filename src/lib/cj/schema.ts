/**
 * DDL لجداول تكامل CJ — تُضاف تلقائياً عند الإقلاع عبر src/data/schema-sync.ts.
 * كلها idempotent (CREATE IF NOT EXISTS). معزولة عن مخطط الموردين الصارم لتفادي
 * أي أثر على تكامل سلة القائم.
 */
export const CJ_DDL: string[] = [
  // رمز وصول CJ مُختوماً (صف واحد id=1).
  `CREATE TABLE IF NOT EXISTS cj_auth (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    sealed_tokens TEXT NULL,
    access_expires_at DATETIME(3) NULL,
    refresh_expires_at DATETIME(3) NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ربط منتجات CJ + تفصيل التسعير. التفرّد يمنع التكرار عند إعادة المزامنة.
  `CREATE TABLE IF NOT EXISTS cj_products (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    cj_product_id VARCHAR(64) NOT NULL,
    cj_variant_id VARCHAR(64) NOT NULL DEFAULT '',
    cj_sku VARCHAR(191) NOT NULL DEFAULT '',
    name VARCHAR(400) NOT NULL DEFAULT '',
    name_ar VARCHAR(400) NOT NULL DEFAULT '',
    source_description MEDIUMTEXT NULL,
    display_description_ar MEDIUMTEXT NULL,
    trbhh_category VARCHAR(200) NOT NULL DEFAULT '',
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    images MEDIUMTEXT NULL,
    hidden TINYINT NOT NULL DEFAULT 0,
    sale_price_override_minor INT NULL,
    image VARCHAR(1024) NOT NULL DEFAULT '',
    supplier_cost_minor INT NOT NULL DEFAULT 0,
    shipping_cost_minor INT NOT NULL DEFAULT 0,
    other_costs_minor INT NOT NULL DEFAULT 0,
    profit_minor INT NOT NULL DEFAULT 0,
    sale_price_minor INT NOT NULL DEFAULT 0,
    margin_bps INT NOT NULL DEFAULT 3000,
    currency VARCHAR(3) NOT NULL DEFAULT 'SAR',
    commerce_product_id BIGINT UNSIGNED NULL,
    trbhh_variant_id VARCHAR(64) NOT NULL DEFAULT '',
    last_sync_at DATETIME(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY cj_product_variant (cj_product_id, cj_variant_id),
    KEY cj_products_commerce (commerce_product_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // أعمدة إدارة السلعة المستوردة (تُضاف على التثبيتات القائمة عبر schema-sync).
  `ALTER TABLE cj_products ADD COLUMN name_ar VARCHAR(400) NOT NULL DEFAULT ''`,
  `ALTER TABLE cj_products ADD COLUMN hidden TINYINT NOT NULL DEFAULT 0`,
  `ALTER TABLE cj_products ADD COLUMN sale_price_override_minor INT NULL`,
  `ALTER TABLE cj_products ADD COLUMN source_description MEDIUMTEXT NULL`,
  `ALTER TABLE cj_products ADD COLUMN display_description_ar MEDIUMTEXT NULL`,
  `ALTER TABLE cj_products ADD COLUMN trbhh_category VARCHAR(200) NOT NULL DEFAULT ''`,
  `ALTER TABLE cj_products ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'draft'`,
  `ALTER TABLE cj_products ADD COLUMN images MEDIUMTEXT NULL`,

  // ذاكرة ترجمة مخزَّنة (نص المصدر ← العربية) لتفادي تكرار طلبات الترجمة.
  `CREATE TABLE IF NOT EXISTS cj_translations (
    source_key CHAR(40) NOT NULL PRIMARY KEY,
    target_ar TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // طلبات CJ داخل تربح (بنية دورة الطلب — لا شراء حقيقي حتى التفعيل اليدوي).
  // internal_ref مفتاح تفرّد داخلي يمنع تكرار الطلب (idempotency).
  `CREATE TABLE IF NOT EXISTS cj_orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    internal_ref VARCHAR(64) NOT NULL,
    user_id BIGINT UNSIGNED NULL,
    cj_product_id VARCHAR(64) NOT NULL DEFAULT '',
    product_name VARCHAR(400) NOT NULL DEFAULT '',
    cj_order_id VARCHAR(64) NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'awaiting_payment',
    status_reason VARCHAR(300) NOT NULL DEFAULT '',
    items_total_minor INT NOT NULL DEFAULT 0,
    shipping_total_minor INT NOT NULL DEFAULT 0,
    tax_total_minor INT NOT NULL DEFAULT 0,
    grand_total_minor INT NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'SAR',
    carrier VARCHAR(120) NOT NULL DEFAULT '',
    tracking_number VARCHAR(160) NOT NULL DEFAULT '',
    tracking_url VARCHAR(1024) NOT NULL DEFAULT '',
    tracking_status VARCHAR(64) NOT NULL DEFAULT '',
    ship_name VARCHAR(160) NOT NULL DEFAULT '',
    ship_phone VARCHAR(40) NOT NULL DEFAULT '',
    ship_country VARCHAR(4) NOT NULL DEFAULT 'SA',
    ship_region VARCHAR(120) NOT NULL DEFAULT '',
    ship_city VARCHAR(120) NOT NULL DEFAULT '',
    ship_address1 VARCHAR(400) NOT NULL DEFAULT '',
    ship_address2 VARCHAR(400) NOT NULL DEFAULT '',
    ship_zip VARCHAR(20) NOT NULL DEFAULT '',
    placed_at DATETIME(3) NULL,
    delivered_at DATETIME(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY cj_orders_ref (internal_ref),
    KEY cj_orders_status (status),
    KEY cj_orders_user (user_id),
    KEY cj_orders_cjid (cj_order_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // سجل أحداث/خط زمني للطلب — event_key فريد يجعل استقبال الأحداث/الـwebhooks idempotent.
  `CREATE TABLE IF NOT EXISTS cj_order_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    event_key VARCHAR(191) NOT NULL,
    type VARCHAR(48) NOT NULL DEFAULT 'note',
    source VARCHAR(24) NOT NULL DEFAULT 'internal',
    from_status VARCHAR(32) NOT NULL DEFAULT '',
    to_status VARCHAR(32) NOT NULL DEFAULT '',
    note VARCHAR(1000) NOT NULL DEFAULT '',
    actor_id BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY cj_order_event_key (event_key),
    KEY cj_order_events_order (order_id, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // مخزن أحداث webhooks من CJ (idempotent عبر مفتاح الحدث).
  `CREATE TABLE IF NOT EXISTS cj_webhook_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_key VARCHAR(191) NOT NULL,
    type VARCHAR(64) NOT NULL DEFAULT '',
    received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY cj_webhook_event_key (event_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

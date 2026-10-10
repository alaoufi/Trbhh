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
  `ALTER TABLE cj_products ADD COLUMN source_category VARCHAR(200) NOT NULL DEFAULT ''`,
  `ALTER TABLE cj_products ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'draft'`,
  `ALTER TABLE cj_products ADD COLUMN images MEDIUMTEXT NULL`,
  `ALTER TABLE cj_products ADD COLUMN details_json MEDIUMTEXT NULL`,
  `ALTER TABLE cj_products ADD COLUMN availability_json MEDIUMTEXT NULL`,
  `ALTER TABLE cj_products ADD COLUMN availability_checked_at DATETIME(3) NULL`,
  `ALTER TABLE cj_products ADD COLUMN agent_user_id BIGINT UNSIGNED NULL`,
  `ALTER TABLE cj_products ADD COLUMN agent_claimed_at DATETIME(3) NULL`,
  `ALTER TABLE cj_products ADD COLUMN highlight_label VARCHAR(80) NOT NULL DEFAULT ''`,
  // توسعة التثبيتات التي أنشأت العمود سابقاً بعرض ٤٠ (ليتسع «الكلمة|اللون»).
  `ALTER TABLE cj_products MODIFY COLUMN highlight_label VARCHAR(80) NOT NULL DEFAULT ''`,
  `CREATE INDEX cj_products_agent ON cj_products (agent_user_id)`,

  // ملف الوكيل: عضو مُنح دور وكيل — جواله وواتسه وحصّته الأسبوعية.
  `CREATE TABLE IF NOT EXISTS cj_agents (
    user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    phone VARCHAR(40) NOT NULL DEFAULT '',
    whatsapp VARCHAR(40) NOT NULL DEFAULT '',
    weekly_quota INT NOT NULL DEFAULT 0,
    active TINYINT NOT NULL DEFAULT 1,
    notes VARCHAR(500) NOT NULL DEFAULT '',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ذاكرة ترجمة مخزَّنة (نص المصدر ← العربية) لتفادي تكرار طلبات الترجمة.
  `CREATE TABLE IF NOT EXISTS cj_translations (
    source_key CHAR(40) NOT NULL PRIMARY KEY,
    target_ar TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // مُسرد مصطلحات التجارة/المنتجات (إنجليزي → عربي ثابت) يُطبَّق محلياً قبل الترجمة
  // الآلية: مطابقة تامّة للحقول القصيرة (ألوان/مقاسات/خيارات) واستبدال المصطلحات
  // كلمةً كلمةً في النص الطويل. src_norm = المصدر بعد التحويل لحروف صغيرة وتوحيد
  // المسافات (مفتاح التفرّد). محرَّر بالكامل من لوحة الإدارة («تعليم» المصطلحات).
  `CREATE TABLE IF NOT EXISTS cj_glossary (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    src_norm VARCHAR(191) NOT NULL,
    source VARCHAR(400) NOT NULL DEFAULT '',
    target_ar VARCHAR(400) NOT NULL DEFAULT '',
    enabled TINYINT NOT NULL DEFAULT 1,
    whole_text TINYINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY cj_glossary_src (src_norm)
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
    cj_lines_json TEXT NULL,
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

  // بنود الطلب (cj_lines_json) تُنشأ ضمن CREATE أعلاه؛ ترقية القواعد القائمة عبر ALTER
  // مبتلَع في src/data/schema-sync.ts (لتبقى CJ_DDL قابلة لإعادة التطبيق بلا خطأ).

  // أعمدة الدفع من محفظة CJ والموافقة والتحقق (المرحلة المالية). كلها ALTER يُبتلَع خطؤها
  // عند وجود العمود مسبقاً. المبالغ المالية الخاصة بـ CJ بالدولار (CJ wallet = USD).
  `ALTER TABLE cj_orders ADD COLUMN cj_shipment_order_id VARCHAR(64) NOT NULL DEFAULT ''`,
  `ALTER TABLE cj_orders ADD COLUMN cj_pay_id VARCHAR(64) NOT NULL DEFAULT ''`,
  `ALTER TABLE cj_orders ADD COLUMN approved_cap_usd_minor INT NOT NULL DEFAULT 0`,
  `ALTER TABLE cj_orders ADD COLUMN actual_payment_usd_minor INT NOT NULL DEFAULT 0`,
  `ALTER TABLE cj_orders ADD COLUMN approved_at DATETIME(3) NULL`,
  `ALTER TABLE cj_orders ADD COLUMN approved_by BIGINT UNSIGNED NULL`,
  `ALTER TABLE cj_orders ADD COLUMN paid_at DATETIME(3) NULL`,
  `ALTER TABLE cj_orders ADD COLUMN verified_at DATETIME(3) NULL`,
  `ALTER TABLE cj_orders ADD COLUMN verified_source VARCHAR(40) NOT NULL DEFAULT ''`,
  `ALTER TABLE cj_orders ADD COLUMN is_test TINYINT NOT NULL DEFAULT 0`,
  `ALTER TABLE cj_orders ADD COLUMN last_polled_at DATETIME(3) NULL`,
  // قفل دفع متفائل: يُضبط ذرّياً قبل استدعاء الدفع فيمنع محاولتين متزامنتين (double-pay).
  // يُمسح عند الفشل للسماح بإعادة محاولة لاحقة، ويبقى عند النجاح (مع paid_at).
  `ALTER TABLE cj_orders ADD COLUMN pay_started_at DATETIME(3) NULL`,

  // دفتر محاسبة CJ — كل حركة مالية (خصم/رسوم/استرداد/تسوية) سطر واحد. المبالغ بالدولار
  // (عملة محفظة CJ). entry_key فريد يمنع تكرار القيد (idempotency للمحاسبة). للمطابقة مع
  // كشف CJ: cj_ref يحمل مرجع CJ (orderId) وsource يميّز مصدر القيد.
  `CREATE TABLE IF NOT EXISTS cj_ledger (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entry_key VARCHAR(191) NOT NULL,
    order_id BIGINT UNSIGNED NULL,
    entry_type VARCHAR(24) NOT NULL DEFAULT 'charge',
    amount_usd_minor INT NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    cj_ref VARCHAR(64) NOT NULL DEFAULT '',
    source VARCHAR(24) NOT NULL DEFAULT 'internal',
    note VARCHAR(500) NOT NULL DEFAULT '',
    reconciled TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY cj_ledger_entry (entry_key),
    KEY cj_ledger_order (order_id),
    KEY cj_ledger_ref (cj_ref)
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

  // أعمدة معالجة الـwebhook: ربط الحدث بطلب وحالته الخام ومعالجته (idempotent).
  `ALTER TABLE cj_webhook_events ADD COLUMN cj_order_id VARCHAR(64) NOT NULL DEFAULT ''`,
  `ALTER TABLE cj_webhook_events ADD COLUMN order_number VARCHAR(64) NOT NULL DEFAULT ''`,
  `ALTER TABLE cj_webhook_events ADD COLUMN raw_status VARCHAR(64) NOT NULL DEFAULT ''`,
  `ALTER TABLE cj_webhook_events ADD COLUMN track_number VARCHAR(160) NOT NULL DEFAULT ''`,
  `ALTER TABLE cj_webhook_events ADD COLUMN processed TINYINT NOT NULL DEFAULT 0`,
  `ALTER TABLE cj_webhook_events ADD COLUMN payload MEDIUMTEXT NULL`,
];

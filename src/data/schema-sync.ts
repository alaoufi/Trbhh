import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * Single source of truth for every column/table the app self-provisions on the
 * legacy database. Consolidates the DDL that used to be scattered across
 * per-module `ensure()` functions (merchant, moderation, roles, …).
 *
 * - Every statement is idempotent (CREATE IF NOT EXISTS; ALTER swallowed when
 *   the column already exists), so re-running is always safe.
 * - Promise-cached: concurrent first requests share one run (the old
 *   per-module `let ensured = false` flags raced on cold start).
 * - Invoked once at server boot via src/instrumentation.ts, and lazily by the
 *   data modules as a belt-and-suspenders guard.
 *
 * NOTE (Phase 2 of docs/REBUILD-PLAN.md): this module is the stepping stone to
 * real `prisma migrate` baselining — the DDL below must stay in lockstep with
 * prisma/schema.prisma, which now declares all of these columns/tables.
 */

const STATEMENTS: string[] = [
  /* ---- stores: merchant branding & business metadata ---- */
  `ALTER TABLE stores ADD COLUMN store_name VARCHAR(120) NULL`,
  `ALTER TABLE stores ADD COLUMN brand_color VARCHAR(9) NULL`,
  `ALTER TABLE stores ADD COLUMN about TEXT NULL`,
  `ALTER TABLE stores ADD COLUMN banner VARCHAR(16) NULL`,
  `ALTER TABLE stores ADD COLUMN tagline VARCHAR(160) NULL`,
  `ALTER TABLE stores ADD COLUMN status TINYINT NOT NULL DEFAULT 1`,
  `ALTER TABLE stores ADD COLUMN home_featured TINYINT NOT NULL DEFAULT 0`,
  `ALTER TABLE stores ADD COLUMN layout VARCHAR(16) NULL`,
  `ALTER TABLE stores ADD COLUMN catalog VARCHAR(16) NULL`,
  `ALTER TABLE stores ADD COLUMN catalog_fields VARCHAR(120) NULL`,
  `ALTER TABLE stores ADD COLUMN activity_since VARCHAR(20) NULL`,
  `ALTER TABLE stores ADD COLUMN specialty VARCHAR(120) NULL`,
  `ALTER TABLE stores ADD COLUMN audience VARCHAR(160) NULL`,
  `ALTER TABLE stores ADD COLUMN show_on_platform TINYINT NOT NULL DEFAULT 0`,
  `ALTER TABLE stores ADD COLUMN national_id VARCHAR(30) NULL`,
  `ALTER TABLE stores ADD COLUMN store_phone VARCHAR(24) NULL`,
  `ALTER TABLE stores ADD COLUMN store_email VARCHAR(120) NULL`,
  `ALTER TABLE stores ADD COLUMN contacts VARCHAR(500) NULL`,
  `ALTER TABLE stores ADD COLUMN terms_agreed TINYINT NOT NULL DEFAULT 0`,
  `ALTER TABLE stores ADD COLUMN terms_agreed_at TIMESTAMP NULL`,
  `ALTER TABLE stores ADD COLUMN handle VARCHAR(32) NULL`,
  `CREATE UNIQUE INDEX uniq_store_handle ON stores (handle)`,
  `ALTER TABLE stores ADD COLUMN allow_ads TINYINT NOT NULL DEFAULT 1`,
  `ALTER TABLE stores ADD COLUMN allow_reviews TINYINT NOT NULL DEFAULT 1`,
  `ALTER TABLE stores ADD COLUMN msg_templates TEXT NULL`,
  `ALTER TABLE stores ADD COLUMN hidden_fields VARCHAR(200) NULL`,
  `ALTER TABLE stores ADD COLUMN announce VARCHAR(300) NULL`,
  `ALTER TABLE stores ADD COLUMN product_note VARCHAR(300) NULL`,
  `ALTER TABLE uploads ADD COLUMN phash VARCHAR(20) NULL`,
  `ALTER TABLE stores ADD COLUMN store_password VARCHAR(255) NULL`,
  `ALTER TABLE stores ADD COLUMN store_username VARCHAR(60) NULL`,
  `CREATE UNIQUE INDEX uniq_store_username ON stores (store_username)`,
  `ALTER TABLE stores ADD COLUMN views INT NOT NULL DEFAULT 0`,
  `ALTER TABLE stores ADD COLUMN sub_until DATETIME NULL`,
  `ALTER TABLE stores ADD COLUMN on_trial TINYINT NOT NULL DEFAULT 0`,
  `ALTER TABLE ads ADD COLUMN expires_at DATETIME NULL`,
  `CREATE INDEX ads_expires_at ON ads (expires_at)`,
  /* فهارس مركّبة لمسار القوائم الساخن: WHERE status,state + ORDER BY bumped_at/created_at
     (كان مسحاً كاملاً + filesort في كل تحميل للرئيسية/الأقسام/القوائم). */
  `CREATE INDEX ads_listing_bumped ON ads (status, state, bumped_at)`,
  `CREATE INDEX ads_listing_created ON ads (status, state, created_at)`,
  /* تسريع فحص «هل شاهد هذا العضو هذا الإعلان» (كان يمسح كل مشاهدات الإعلان). */
  `CREATE INDEX ads_views_ad_user ON ads_views (ads_id, user_id)`,
  `CREATE TABLE IF NOT EXISTS store_visits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    store_id BIGINT UNSIGNED NOT NULL,
    viewer VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX store_visits_store (store_id),
    INDEX store_visits_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `ALTER TABLE store_visits ADD COLUMN source VARCHAR(20) NULL`,
  /* per-store backups (JSON snapshots) — auto (periodic) + manual, owner can restore */
  `CREATE TABLE IF NOT EXISTS store_backups (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    store_id INT NOT NULL,
    kind VARCHAR(10) NOT NULL DEFAULT 'auto',
    data LONGTEXT NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX store_backups_store (store_id),
    INDEX store_backups_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* subscription-expiry reminders: dedupe how many times we've reminded a store
     in the CURRENT sub period (sub_until), at most once per day. */
  `CREATE TABLE IF NOT EXISTS store_sub_reminders (
    store_id INT NOT NULL PRIMARY KEY,
    sub_until DATETIME NULL,
    sent INT NOT NULL DEFAULT 0,
    last_sent DATETIME NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS store_contacts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    store_id BIGINT UNSIGNED NOT NULL,
    viewer VARCHAR(64) NOT NULL,
    kind VARCHAR(12) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX store_contacts_store (store_id),
    INDEX store_contacts_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ---- store relations ---- */
  `CREATE TABLE IF NOT EXISTS store_offers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_store INT NOT NULL,
    to_store INT NOT NULL,
    kind VARCHAR(12) NOT NULL,
    status TINYINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_offer (from_store, to_store, kind)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS store_follows (
    store_id INT NOT NULL, user_id INT NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (store_id, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS store_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    store_id INT NOT NULL, user_id INT NOT NULL,
    star TINYINT NOT NULL DEFAULT 5, note VARCHAR(500) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_store_user (store_id, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS store_warnings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    store_id INT NOT NULL, reason VARCHAR(300) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* ربط حسابات الشخص الواحد المنفصلة في مجموعة واحدة (نفس المالك). كل حساب
     في مجموعة واحدة عبر group_id — لا دمج بيانات، فقط علاقة «نفس المالك». */
  `CREATE TABLE IF NOT EXISTS account_links (
    user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    group_id BIGINT UNSIGNED NOT NULL,
    linked_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX account_links_group (group_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* تفضيل التبديل لكل حساب مرتبط: 'direct' تبديل مباشر، 'confirm' يطلب تأكيداً
     قبل أي إجراء (ذكّرني). الافتراضي 'confirm' للأمان. */
  `ALTER TABLE account_links ADD COLUMN mode VARCHAR(10) NOT NULL DEFAULT 'confirm'`,
  /* حظر عضو لعضو: يمنع المراسلة بين الطرفين (متطلّب سياسات المتاجر للمحتوى
     الذي ينشئه المستخدم — إلى جانب البلاغ). */
  `CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id BIGINT UNSIGNED NOT NULL,
    blocked_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_id, blocked_id),
    INDEX user_blocks_blocked (blocked_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* products the merchant explicitly showcases in the store (independent
     catalog — nothing from the owner's platform ads appears automatically) */
  `CREATE TABLE IF NOT EXISTS store_products (
    store_id INT NOT NULL, ad_id INT NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (store_id, ad_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* two-party ownership transfer: transferee requests, owner approves, admin
     executes. status 0=requested 1=owner-approved 2=completed */
  `CREATE TABLE IF NOT EXISTS store_transfers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    store_id INT NOT NULL,
    from_user INT NOT NULL, to_user INT NOT NULL,
    status TINYINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL, completed_at TIMESTAMP NULL,
    UNIQUE KEY uniq_store_transfer (store_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* كوبونات المتجر: رموز خصم يعرضها المتجر لعملائه (التفعيل العام من التحكم). */
  `CREATE TABLE IF NOT EXISTS store_coupons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    store_id INT NOT NULL,
    code VARCHAR(30) NOT NULL,
    discount VARCHAR(80) NOT NULL,
    active TINYINT NOT NULL DEFAULT 1,
    expires_at DATE NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX store_coupons_store (store_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* حالة توفر المنتج: 0 متوفر، 1 نفدت الكمية، 2 طلب مسبق. */
  `ALTER TABLE ads ADD COLUMN stock_state TINYINT NOT NULL DEFAULT 0`,
  /* عروض اليوم: السعر قبل الخصم — إن كان أعلى من السعر يظهر الخصم ويدخل صفحة العروض. */
  `ALTER TABLE ads ADD COLUMN old_price DOUBLE NOT NULL DEFAULT 0`,
  /* ⚠️ عبارة تصحيح «المميّز» أُزيلت من هنا (٢٠٢٦-٠٧-١٥): كانت تعتمد على
     wallet_txns فقط فألغت تمييز إعلانات مدفوعة فعلياً عبر جدول transactions
     القديم (ads_id/status) الذي فات هذا الشرط. لا تُعِد أي تصحيح تلقائي لهذا
     العمود قبل التحقّق الدقيق من مصدر الدفع الحقيقي — انظر docs/FEATURED-INCIDENT.md. */
  /* دوام المتجر: من/إلى (HH:MM) وأيام العمل (أرقام أيام الأسبوع 0=الأحد، مفصولة بفواصل). */
  `ALTER TABLE stores ADD COLUMN hours_from VARCHAR(5) NULL`,
  `ALTER TABLE stores ADD COLUMN hours_to VARCHAR(5) NULL`,
  `ALTER TABLE stores ADD COLUMN hours_days VARCHAR(30) NULL`,
  /* المزادات: مزاد على إعلان (رسم فتح من التحكم) + مزايدات الأعضاء. status 0=مفتوح 1=مغلق */
  `CREATE TABLE IF NOT EXISTS auctions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ad_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    start_price INT NOT NULL DEFAULT 0,
    min_step INT NOT NULL DEFAULT 1,
    ends_at DATETIME NOT NULL,
    status TINYINT NOT NULL DEFAULT 0,
    winner_id BIGINT UNSIGNED NULL,
    winner_bid INT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX auctions_open (status, ends_at),
    INDEX auctions_ad (ad_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS bids (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    auction_id BIGINT NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    amount INT NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX bids_auction (auction_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* موظفو المتجر: أعضاء يضيفهم صاحب المتجر برقم الجوال ليضيفوا منتجات باسم المتجر. */
  `CREATE TABLE IF NOT EXISTS store_staff (
    store_id INT NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (store_id, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* ترقية نص رسالة تأكيد الشحن للصيغة الجديدة — فقط إن كان المحفوظ هو النص
     الافتراضي القديم (تعديلات المدير اليدوية من «النصوص» لا تُمَسّ). */
  `UPDATE site_settings SET v = 'تم تأكيد الشحن وإضافة {amount} ر.س إلى رصيدك ✅ شكراً لاختياركم تربح {name}، نتمنى لكم التوفيق 🎉 بإمكانكم استخدام الرصيد بكافة الوسائل لدعم إعلاناتكم. — الإدارة'
   WHERE k = 'msg_topup_ok' AND v = 'شكراً لثقتك في منصة تربح {name} 🎉 تم إضافة رصيد بمبلغ {amount} ر.س — يمكنك استخدامه في المدفوعات المختلفة. — الإدارة'`,
  /* طلبات تغيير اسم العضو: الاسم يتغيّر بموافقة الإدارة فقط (سبب + مستند إثبات).
     status: 0 معلّق، 1 موافَق، 2 مرفوض — doc = معرف صف uploads للمستند. */
  `CREATE TABLE IF NOT EXISTS name_requests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    old_name VARCHAR(255) NOT NULL DEFAULT '',
    new_name VARCHAR(255) NOT NULL DEFAULT '',
    reason TEXT NULL,
    doc INT NOT NULL DEFAULT 0,
    status TINYINT NOT NULL DEFAULT 0,
    note VARCHAR(255) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME NULL,
    INDEX name_requests_user (user_id),
    INDEX name_requests_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* نوع طلب الاسم: user (اسم عضو) أو store (استثناء اسم متجر مشابه). */
  `ALTER TABLE name_requests ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'user'`,
  /* التجديد التلقائي للاشتراك: مفعّل؟ + آخر خطة مدفوعة (monthly/sixmo/yearly) للتجديد بها. */
  `ALTER TABLE stores ADD COLUMN auto_renew TINYINT NOT NULL DEFAULT 0`,
  `ALTER TABLE stores ADD COLUMN sub_plan VARCHAR(10) NULL`,
  /* باقة متجر Plus: اشتراك + عرض في تربح + شارة ⭐ حتى هذا التاريخ. */
  `ALTER TABLE stores ADD COLUMN plus_until DATETIME NULL`,
  /* ---- moderation ---- */
  `ALTER TABLE users ADD COLUMN ban_until DATETIME NULL`,
  `CREATE INDEX users_ban ON users (ban, ban_until)`,
  `ALTER TABLE users ADD COLUMN verify_note VARCHAR(300) NULL`,
  /* التوثيق المدفوع: طلب صاحب المتجر ← موافقة إدارة المتاجر ← خصم الرسوم وتفعيل لمدة أيام.
     status: 0 معلق، 1 نشط (مدفوع)، 2 مرفوض، 3 ملغى (مع استرداد نسبي)، 4 منتهٍ. */
  `CREATE TABLE IF NOT EXISTS verify_orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    store_id INT NOT NULL DEFAULT 0,
    fee INT NOT NULL,
    days INT NOT NULL,
    status TINYINT NOT NULL DEFAULT 0,
    note VARCHAR(300) NULL,
    refund INT NOT NULL DEFAULT 0,
    admin_id BIGINT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME NULL,
    expires_at DATETIME NULL,
    INDEX verify_orders_user (user_id),
    INDEX verify_orders_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* تاريخ التوثيق: متى مُنح العضو شارة موثّق (للتدقيق). */
  `ALTER TABLE users ADD COLUMN verified_at DATETIME NULL`,
  /* ---- wallet / credit (رصيد) ---- */
  /* عزل إعلانات المتاجر: علامة store_only تُنشأ مع إعلان المتجر فلا يظهر في قوائم تربح إطلاقاً. */
  `ALTER TABLE ads ADD COLUMN store_only TINYINT NOT NULL DEFAULT 0`,
  /* عرض مدفوع في تربح: إعلان متجر يظهر في قوائم تربح حتى هذا التاريخ. */
  `ALTER TABLE ads ADD COLUMN trbhh_until DATETIME NULL`,
  /* شارة عاجل المدفوعة حتى هذا التاريخ. */
  `ALTER TABLE ads ADD COLUMN urgent_until DATETIME NULL`,
  /* نوع السعر يستخدم عمود price_type القديم (rent/sale/som) — ومدة التأجير عمود جديد. */
  `ALTER TABLE ads ADD COLUMN rent_period VARCHAR(20) NULL`,
  /* تحديث الإعلان (Bump): آخر رفع للأعلى — الترتيب يعتمده عند وجوده. */
  `ALTER TABLE ads ADD COLUMN bumped_at DATETIME NULL`,
  /* بصمة إيصال الشحن (aHash): لكشف تطابق السند مع سند طلب سابق. */
  `ALTER TABLE wallet_topups ADD COLUMN receipt_hash VARCHAR(16) NULL`,
  /* إيقاف من صاحب الإعلان: يميّز الموقوف بإرادته عن المنتظر موافقة الإدارة. */
  `ALTER TABLE ads ADD COLUMN paused_by_owner TINYINT NOT NULL DEFAULT 0`,
  /* جدولة النشر: يبقى مخفياً حتى هذا الموعد ثم يُنشر تلقائياً. */
  `ALTER TABLE ads ADD COLUMN publish_at DATETIME NULL`,
  /* عرض المتجر (واجهته ومنتجاته) في رئيسية تربح حتى هذا التاريخ (NULL = بقرار إداري دائم). */
  `ALTER TABLE stores ADD COLUMN show_until DATETIME NULL`,
  /* التنبيهات: تاريخ القراءة — الجديد ملوّن والمقروء يُؤرشف. */
  `ALTER TABLE notfications ADD COLUMN read_at DATETIME NULL`,
  `ALTER TABLE users ADD COLUMN balance INT NOT NULL DEFAULT 0`,
  /* نظام النقاط: رصيد النقاط + سجلها، والإحالة: من دعا هذا العضو. */
  `ALTER TABLE users ADD COLUMN points INT NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN ref_by INT NULL`,
  `CREATE TABLE IF NOT EXISTS point_txns (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    points INT NOT NULL,
    reason VARCHAR(40) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX point_txns_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `ALTER TABLE users ADD COLUMN dup_credit INT NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS wallet_txns (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    amount INT NOT NULL,
    balance_after INT NOT NULL,
    reason VARCHAR(40) NOT NULL,
    note VARCHAR(200) NULL,
    admin_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX wallet_txns_user (user_id),
    INDEX wallet_txns_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* member top-up requests: amount + transfer receipt, admin confirms then credits. */
  `CREATE TABLE IF NOT EXISTS wallet_topups (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    amount INT NOT NULL,
    receipt VARCHAR(255) NULL,
    status TINYINT NOT NULL DEFAULT 0,
    note VARCHAR(300) NULL,
    admin_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME NULL,
    INDEX wallet_topups_user (user_id),
    INDEX wallet_topups_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* site running expenses (admin-entered) — feeds the detailed budget view. */
  `CREATE TABLE IF NOT EXISTS site_expenses (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(120) NOT NULL,
    amount INT NOT NULL,
    note VARCHAR(300) NULL,
    spent_at DATE NULL,
    admin_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX site_expenses_date (spent_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* web-push subscriptions (per device) — sent when admin enables push. */
  `CREATE TABLE IF NOT EXISTS push_subs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    endpoint VARCHAR(500) NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX push_subs_user (user_id),
    INDEX push_subs_endpoint (endpoint(191))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* saved searches — member gets notified when a matching ad is published. */
  `CREATE TABLE IF NOT EXISTS saved_searches (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    query VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    notified_at DATETIME NULL,
    INDEX saved_searches_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* عدّاد تواصل الإعلان: ضغطات واتساب/اتصال لكل إعلان (مرة لكل زائر/نوع). */
  `CREATE TABLE IF NOT EXISTS ad_contacts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ad_id BIGINT UNSIGNED NOT NULL,
    viewer VARCHAR(64) NOT NULL,
    kind VARCHAR(12) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ad_contacts_ad (ad_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* admin activity audit log — who did what and when. */
  `CREATE TABLE IF NOT EXISTS admin_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    admin_id BIGINT UNSIGNED NOT NULL,
    action VARCHAR(60) NOT NULL,
    target VARCHAR(160) NULL,
    note VARCHAR(300) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX admin_log_admin (admin_id),
    INDEX admin_log_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS dup_attempts (
    user_id BIGINT UNSIGNED NOT NULL,
    count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS user_strikes (
    user_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(16) NOT NULL,
    count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, kind)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS mod_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(16) NOT NULL,
    category VARCHAR(16) NULL,
    term VARCHAR(160) NULL,
    snippet VARCHAR(300) NULL,
    action VARCHAR(16) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX mod_log_user (user_id),
    INDEX mod_log_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* سجل نشر ثابت — لا يتأثر بحذف الإعلان لاحقاً، فيمنع الحد اليومي/الفاصل
     الزمني من "إعادة التصفير" بحذف الإعلان ونشر آخر بدلاً عنه. */
  `CREATE TABLE IF NOT EXISTS ad_publish_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ad_publish_log_user (user_id),
    INDEX ad_publish_log_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ---- roles & permissions ---- */
  `CREATE TABLE IF NOT EXISTS admin_perms (
    user_id BIGINT UNSIGNED NOT NULL,
    perm VARCHAR(40) NOT NULL,
    PRIMARY KEY (user_id, perm)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS admin_roles (
    user_id BIGINT UNSIGNED NOT NULL,
    role VARCHAR(20) NOT NULL,
    PRIMARY KEY (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS role_perms (
    role VARCHAR(20) NOT NULL,
    perm VARCHAR(40) NOT NULL,
    PRIMARY KEY (role, perm)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ---- settings / word filters ---- */
  `CREATE TABLE IF NOT EXISTS site_settings (
    k VARCHAR(60) NOT NULL PRIMARY KEY,
    v TEXT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* القيم الطويلة (جدول حملات الشحن JSON، حسابات البنوك المتعددة، النصوص) كانت
     تُبتر أو يفشل حفظها في VARCHAR(255) — توسعة العمود إلى TEXT. */
  `ALTER TABLE site_settings MODIFY v TEXT NULL`,
  `CREATE TABLE IF NOT EXISTS banned_words (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    word VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* كلمات/جمل ممنوعة في أسماء الأعضاء والمتاجر (قائمة مستقلة عن حجب المحتوى):
     الجملة تُمنع مجتمعةً فقط — «الملك سلمان» ممنوعة بينما «سلمان» وحدها مقبولة. */
  `CREATE TABLE IF NOT EXISTS name_words (
    id INT AUTO_INCREMENT PRIMARY KEY,
    word VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS guard_words (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(12) NOT NULL,
    word VARCHAR(120) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ---- member preferences & media ---- */
  `CREATE TABLE IF NOT EXISTS member_interests (
    user_id BIGINT UNSIGNED NOT NULL,
    category_id INT NOT NULL,
    PRIMARY KEY (user_id, category_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS user_area (
    user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    area_id INT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS ad_media (
    ad_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(10) NOT NULL,
    path VARCHAR(255) NOT NULL,
    PRIMARY KEY (ad_id, kind)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS member_seen (
    user_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(16) NOT NULL,
    seen_id BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, kind)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ---- auth / chat ---- */
  `CREATE TABLE IF NOT EXISTS password_otps (
    phone VARCHAR(20) NOT NULL PRIMARY KEY,
    code VARCHAR(6) NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    last_sent DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS chat_typing (
    user_id INT NOT NULL,
    peer_id INT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, peer_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ---- classified ads (smart-designer cards) ---- */
  `CREATE TABLE IF NOT EXISTS classified_ads (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NULL,
    title VARCHAR(255) NULL,
    body TEXT NULL,
    image VARCHAR(255) NULL,
    phone VARCHAR(40) NULL,
    whatsapp VARCHAR(40) NULL,
    link VARCHAR(500) NULL,
    theme TINYINT NOT NULL DEFAULT 0,
    status TINYINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    content_pos VARCHAR(10) NOT NULL DEFAULT 'bottom',
    text_align VARCHAR(10) NOT NULL DEFAULT 'right',
    font_size VARCHAR(4) NOT NULL DEFAULT 'md',
    bold TINYINT NOT NULL DEFAULT 1,
    pattern VARCHAR(10) NOT NULL DEFAULT 'none',
    accent VARCHAR(10) NOT NULL DEFAULT 'none',
    views INT NOT NULL DEFAULT 0,
    clicks INT NOT NULL DEFAULT 0,
    layout VARCHAR(8) NOT NULL DEFAULT 'auto',
    expires_at DATETIME NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `ALTER TABLE classified_ads ADD COLUMN content_pos VARCHAR(10) NOT NULL DEFAULT 'bottom'`,
  `ALTER TABLE classified_ads ADD COLUMN text_align VARCHAR(10) NOT NULL DEFAULT 'right'`,
  `ALTER TABLE classified_ads ADD COLUMN font_size VARCHAR(4) NOT NULL DEFAULT 'md'`,
  `ALTER TABLE classified_ads ADD COLUMN bold TINYINT NOT NULL DEFAULT 1`,
  `ALTER TABLE classified_ads ADD COLUMN pattern VARCHAR(10) NOT NULL DEFAULT 'none'`,
  `ALTER TABLE classified_ads ADD COLUMN accent VARCHAR(10) NOT NULL DEFAULT 'none'`,
  `ALTER TABLE classified_ads ADD COLUMN views INT NOT NULL DEFAULT 0`,
  `ALTER TABLE classified_ads ADD COLUMN clicks INT NOT NULL DEFAULT 0`,
  `ALTER TABLE classified_ads ADD COLUMN layout VARCHAR(8) NOT NULL DEFAULT 'auto'`,
  `ALTER TABLE classified_ads ADD COLUMN expires_at DATETIME NULL`,
  `CREATE TABLE IF NOT EXISTS classified_views (
    ad_id BIGINT UNSIGNED NOT NULL,
    viewer VARCHAR(64) NOT NULL,
    PRIMARY KEY (ad_id, viewer)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ---- account deletion (Google Play data-safety requirement) ---- */
  `CREATE TABLE IF NOT EXISTS deletion_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(24) NOT NULL,
    name VARCHAR(120) NULL,
    note VARCHAR(500) NULL,
    status TINYINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ---- legacy-table amendments ---- */
  `ALTER TABLE repord_ads ADD COLUMN response TEXT NULL`,
  `ALTER TABLE repord_ads ADD COLUMN responded_at TIMESTAMP NULL`,
  // معالجة البلاغ: إجراء إجباري (حظر/حذف/تجاهل) يُغلق البلاغ ويُرسل رسالة للمُبلِّغ ولصاحب الإعلان
  `ALTER TABLE repord_ads ADD COLUMN status TINYINT NOT NULL DEFAULT 0`,
  `ALTER TABLE repord_ads ADD COLUMN action VARCHAR(16) NULL`,
  `ALTER TABLE repord_ads ADD COLUMN handled_at TIMESTAMP NULL`,
  `ALTER TABLE repord_ads ADD COLUMN handled_by BIGINT UNSIGNED NULL`,
  // مراجعة حظر آلي: فك الحظر أو الإبقاء عليه — يُغلق تنبيه «حظر آلي جديد» في لوحة الإدارة
  `ALTER TABLE mod_log ADD COLUMN reviewed_at TIMESTAMP NULL`,
  // الإعلان المرتبط بالحدث (الإعلان الأصلي المطابق في حالة التكرار، أو إعلان البلاغ) — لعرضه عند اتخاذ القرار
  `ALTER TABLE mod_log ADD COLUMN ad_id BIGINT UNSIGNED NULL`,
  `ALTER TABLE chats MODIFY message TEXT`,
  /* نشر إعلان ببصور كان يمسح كامل جدولي uploads/photos بلا فهرس عند فحص
     التكرار بالصور وجلب صور كل إعلان — كل صفحة إعلان وكل نشر يمرّان من هنا. */
  `CREATE INDEX uploads_user_type ON uploads (user_id, type)`,
  `CREATE INDEX photos_other_id ON photos (other_id)`,
  // مواضيع النقاش كانت بلا صاحب مسجَّل إطلاقاً — يمنع كشف تكرار نفس العضو لموضوعه
  `ALTER TABLE debates ADD COLUMN user_id INT NULL`,
];

let syncPromise: Promise<void> | null = null;

async function run(): Promise<void> {
  // Snapshot the existing columns & indexes up front so we NEVER issue an
  // `ADD COLUMN`/`CREATE INDEX` that already exists. Prisma logs `prisma:error`
  // to stdout for a failing raw query even when we `.catch()` it — so the only
  // way to keep boot logs clean is to not run the doomed statement at all.
  const colRows = await prisma
    .$queryRawUnsafe<{ t: string; c: string }[]>(
      `SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`,
    )
    .catch(() => [] as { t: string; c: string }[]);
  const idxRows = await prisma
    .$queryRawUnsafe<{ t: string; i: string }[]>(
      `SELECT TABLE_NAME AS t, INDEX_NAME AS i FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()`,
    )
    .catch(() => [] as { t: string; i: string }[]);
  const colSet = new Set(colRows.map((r) => `${r.t.toLowerCase()}.${r.c.toLowerCase()}`));
  const idxSet = new Set(idxRows.map((r) => `${r.t.toLowerCase()}.${r.i.toLowerCase()}`));
  const tableSet = new Set([...colSet].map((k) => k.split('.')[0]));

  for (const sql of STATEMENTS) {
    const addCol = sql.match(/^ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i);
    if (addCol && colSet.has(`${addCol[1].toLowerCase()}.${addCol[2].toLowerCase()}`)) continue;
    const addIdx = sql.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+(\w+)/i);
    if (addIdx && idxSet.has(`${addIdx[2].toLowerCase()}.${addIdx[1].toLowerCase()}`)) continue;
    const createTbl = sql.match(/^CREATE TABLE IF NOT EXISTS\s+(\w+)/i);

    // Best-effort: anything still failing (e.g. a legacy table truly absent) stays silent.
    await prisma.$executeRawUnsafe(sql).catch(() => {});

    // Keep the local sets in sync so later statements see what we just created.
    if (addCol) colSet.add(`${addCol[1].toLowerCase()}.${addCol[2].toLowerCase()}`);
    if (addIdx) idxSet.add(`${addIdx[2].toLowerCase()}.${addIdx[1].toLowerCase()}`);
    // A freshly created table: learn its columns so its follow-up (legacy) ADD
    // COLUMN migrations are skipped instead of erroring on a clean install.
    if (createTbl && !tableSet.has(createTbl[1].toLowerCase())) {
      tableSet.add(createTbl[1].toLowerCase());
      const rows = await prisma
        .$queryRawUnsafe<{ c: string }[]>(
          `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
          createTbl[1],
        )
        .catch(() => [] as { c: string }[]);
      for (const r of rows) colSet.add(`${createTbl[1].toLowerCase()}.${r.c.toLowerCase()}`);
    }
  }

  await backfillDupModLogAdIds();
  await backfillAdBanAction();
  await backfillAccountDeletedAction();
}

/** ترقيع لمرة واحدة: سجلات التكرار الآلي القديمة (قبل إضافة عمود ad_id) خزّنت
 *  رقم الإعلان الأصلي داخل نص المقتطف («مكرّر مع #123 ...») — نستخرجه رجعياً
 *  ليعمل زر «عرض الإعلان» حتى على الحوادث السابقة. لا تأثير على سجلات مكتملة أصلاً. */
async function backfillDupModLogAdIds(): Promise<void> {
  const rows = await prisma.mod_log.findMany({
    where: { ad_id: null, kind: { in: ['duplicate', 'duplicate_cross'] }, snippet: { not: null } },
    select: { id: true, snippet: true },
  }).catch(() => []);
  for (const r of rows) {
    const m = r.snippet?.match(/#(\d+)/);
    if (!m) continue;
    await prisma.mod_log.update({ where: { id: r.id }, data: { ad_id: BigInt(m[1]) } }).catch(() => {});
  }
}

/** ترقيع لمرة واحدة: سجلات «حظر إعلان نهائياً» (زر الحظر المباشر لإعلان مخالف)
 *  كانت تُخزَّن بـ action='banned' — نفس قيمة حظر الحساب — فتظهر خطأً في صندوق
 *  «حظر آلي بانتظار المراجعة» رغم أنه لا يوجد حساب محظور لفكّه أو الإبقاء عليه؛
 *  الإعلان نفسه محذوف نهائياً بالفعل (إجراء إداري مباشر مكتمل). نصحّحها لـ 'ad_banned'. */
async function backfillAdBanAction(): Promise<void> {
  await prisma.mod_log.updateMany({
    where: { action: 'banned', kind: 'content', snippet: { startsWith: 'حظر إعلان نهائياً:' } },
    data: { action: 'ad_banned' },
  }).catch(() => {});
}

/** ترقيع لمرة واحدة: سجلات حذف حساب (بطلب صاحبه) كانت تُخزَّن أيضاً بـ action='banned'
 *  لنفس السبب — لا حظر إشرافي فعلي يحتاج مراجعة على حساب مموَّه ومقفل نهائياً. */
async function backfillAccountDeletedAction(): Promise<void> {
  await prisma.mod_log.updateMany({
    where: { action: 'banned', kind: 'account', snippet: 'account deleted at owner request' },
    data: { action: 'account_deleted' },
  }).catch(() => {});
}

/** Idempotent schema sync — shared promise so concurrent callers run it once. */
export function ensureSchema(): Promise<void> {
  if (!syncPromise) {
    syncPromise = run().catch((e) => {
      syncPromise = null; // allow retry on a later call
      throw e;
    });
  }
  return syncPromise;
}

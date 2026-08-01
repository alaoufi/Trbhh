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
  /* بوب أب ترحيب خاص بكل متجر — نص يعدّله المالك وتفعيل/تعطيل مستقل (لا يعتمد
     على إفراغ النص فقط، بخلاف announce) لأن المالك قد يريد إيقافه مؤقتاً دون فقد نصه. */
  `ALTER TABLE stores ADD COLUMN welcome_msg VARCHAR(300) NULL`,
  `ALTER TABLE stores ADD COLUMN welcome_on TINYINT NOT NULL DEFAULT 0`,
  /* العلامة المائية على صور إعلانات المتجر: 'name' اسم المتجر أو 'logo' شعاره (اختيار المالك) */
  `ALTER TABLE stores ADD COLUMN watermark_kind VARCHAR(8) NULL`,
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
  /* تقييم منصة تربح بالنجوم — صف واحد لكل زائر/عضو (viewer_key: u{id} للعضو، g{vid} للزائر عبر كوكي trbhh_vid). */
  `CREATE TABLE IF NOT EXISTS platform_reviews (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    viewer_key VARCHAR(64) NOT NULL,
    star TINYINT NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY platform_reviews_viewer (viewer_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `ALTER TABLE platform_reviews ADD COLUMN user_id INT NULL`,
  `ALTER TABLE platform_reviews ADD COLUMN note VARCHAR(500) NULL`,
  `CREATE TABLE IF NOT EXISTS store_sub_reminders (
    store_id INT NOT NULL PRIMARY KEY,
    sub_until DATETIME NULL,
    sent INT NOT NULL DEFAULT 0,
    last_sent DATETIME NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* نفس فكرة store_sub_reminders لكن لـ«عرض المتجر في تربح» (stores.show_until). */
  `CREATE TABLE IF NOT EXISTS store_show_reminders (
    store_id INT NOT NULL PRIMARY KEY,
    show_until DATETIME NULL,
    sent INT NOT NULL DEFAULT 0,
    last_sent DATETIME NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* نفس الفكرة لكن لكل إعلان على حدة («عرض الإعلان في تربح» — ads.trbhh_until). */
  `CREATE TABLE IF NOT EXISTS ad_show_reminders (
    ad_id BIGINT NOT NULL PRIMARY KEY,
    trbhh_until DATETIME NULL,
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
  /* إيقاف المتجر: السبب وتاريخه/وقته — يُعرضان مع حالة الإيقاف؛ الإيقاف لا يُحفظ بلا سبب. */
  `ALTER TABLE stores ADD COLUMN suspend_reason VARCHAR(300) NULL`,
  `ALTER TABLE stores ADD COLUMN suspend_at DATETIME NULL`,
  /* ---- moderation ---- */
  `ALTER TABLE users ADD COLUMN ban_until DATETIME NULL`,
  `CREATE INDEX users_ban ON users (ban, ban_until)`,
  // مصدر الحظر: 'auto' حظر آلي غير جسيم (تكرار/فئة أقل) — لا يُسقط متجراً معتمداً عند تفعيل درع المتجر ·
  // 'admin' حظر إداري متعمَّد أو محتوى جسيم (غير أخلاقي/صورة إباحية) — يُخفي المتجر · NULL حظر قديم يُعامَل كإداري.
  `ALTER TABLE users ADD COLUMN ban_source VARCHAR(10) NULL`,
  // سبب الحظر وتاريخه/وقته — يُعرضان مع كل حظر (يدوي أو آلي)؛ الحظر اليدوي لا يُحفظ بلا سبب.
  `ALTER TABLE users ADD COLUMN ban_reason VARCHAR(300) NULL`,
  `ALTER TABLE users ADD COLUMN ban_at DATETIME NULL`,
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
  /* مبلغ محجوز (رصيد مُجمَّد لطلبات الموافقة المدفوعة): يُحسم من المتاح دون خصم من
     الرصيد، ويُثبَّت خصماً عند الموافقة أو يُعاد للمتاح عند الرفض. */
  `ALTER TABLE users ADD COLUMN reserved INT NOT NULL DEFAULT 0`,
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
  /* توسيع البصمة إلى بصمة مركّبة أدق (receiptHash: aHash+dHash بدقة 16×16 = 512 بت) —
   *  البصمة القديمة (aHash 8×8 وحدها) كانت تخلط بين مستندات مختلفة بنفس قالب التصميم. */
  `ALTER TABLE wallet_topups MODIFY COLUMN receipt_hash VARCHAR(140) NULL`,
  /* الدفع الإلكتروني: طلب الشحن قد يكون عبر بوابة دفع (source='online') بدل التحويل + الإيصال. */
  `ALTER TABLE wallet_topups ADD COLUMN source VARCHAR(10) NULL`,
  `ALTER TABLE wallet_topups ADD COLUMN provider VARCHAR(20) NULL`,
  `ALTER TABLE wallet_topups ADD COLUMN provider_ref VARCHAR(160) NULL`,
  `ALTER TABLE wallet_topups ADD COLUMN method VARCHAR(20) NULL`,
  `ALTER TABLE wallet_topups ADD COLUMN paid_at DATETIME NULL`,
  `CREATE INDEX wallet_topups_pref ON wallet_topups (provider_ref)`,
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
  /* نظام وقائي: كل خطأ تصيير/انقطاع يعترضه العضو (شاشة «حدث خطأ غير متوقع») يُسجَّل هنا
   *  تلقائياً — رسالة الخطأ ورقمه التعريفي (digest) ورابط الصفحة والعضو (إن كان مسجّلاً)
   *  ومتصفحه — ليكتشف الفريق أي أعطال متكررة قبل أن يبلّغ عنها أحد. */
  `CREATE TABLE IF NOT EXISTS error_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message VARCHAR(500) NOT NULL,
    digest VARCHAR(64) NULL,
    stack TEXT NULL,
    url VARCHAR(300) NULL,
    user_id BIGINT UNSIGNED NULL,
    user_agent VARCHAR(300) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX error_log_created (created_at)
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
  /* جُمل مسموحة تُستثنى من التشفير رغم احتوائها كلمة ممنوعة (مثل «وايت سكس»). */
  `CREATE TABLE IF NOT EXISTS allowed_phrases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phrase VARCHAR(160) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* الإعلانات المُشفَّرة (محتوى مشكوك فيه نُشر قيد المراجعة) — نص الكلمات المكشوفة للإدارة. */
  `ALTER TABLE ads ADD COLUMN flag_terms VARCHAR(400) NULL`,
  `ALTER TABLE classified_ads ADD COLUMN flag_terms VARCHAR(400) NULL`,

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
  `ALTER TABLE classified_ads ADD COLUMN publish_at DATETIME NULL`,
  // عزل بالهوية: كل مبوّب يُنسب لهوية ناشره (profile_id) — القديم NULL يتبع الهوية الافتراضية
  `ALTER TABLE classified_ads ADD COLUMN profile_id BIGINT NULL`,
  // عزل المفضّلة بالهوية: كل حفظ يُنسب للهوية التي حفظت (القديم NULL يتبع الافتراضية)
  `ALTER TABLE favorites ADD COLUMN profile_id BIGINT NULL`,
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
  /* تصنيف ذكي محلي للإعلانات: 0 = عيّنه المصنّف الآلي وبانتظار مراجعة الإدارة،
     1 = اختاره العضو صراحةً أو اعتمدته الإدارة (لا حاجة لمراجعة). */
  `ALTER TABLE ads ADD COLUMN cat_reviewed TINYINT NOT NULL DEFAULT 1`,
  `CREATE INDEX ads_cat_reviewed ON ads (cat_reviewed)`,
  /* ---- نظام هويات النشر المتعددة تحت دخول واحد (profiles) ----
     كل هوية تتبع مستخدماً (user_id): شخصية أو متجر، ببياناتها الظاهرة المستقلة. */
  `CREATE TABLE IF NOT EXISTS profiles (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(10) NOT NULL DEFAULT 'personal',
    store_id BIGINT UNSIGNED NULL,
    name VARCHAR(120) NULL,
    phone VARCHAR(24) NULL,
    whatsapp VARCHAR(24) NULL,
    email VARCHAR(120) NULL,
    handle VARCHAR(32) NULL,
    avatar INT NOT NULL DEFAULT 0,
    color VARCHAR(9) NULL,
    status TINYINT NOT NULL DEFAULT 1,
    is_default TINYINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX profiles_user (user_id),
    INDEX profiles_store (store_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE UNIQUE INDEX uniq_profile_handle ON profiles (handle)`,
  // قالب الهوية: يُطبَّق على الموقع (data-theme) عند تفعيل الهوية للتفريق البصري
  `ALTER TABLE profiles ADD COLUMN theme VARCHAR(16) NULL`,
  // اشتراك الهوية الإضافية: نهاية الاشتراك الشهري المدفوع (التجربة تُحتسب من created_at)
  `ALTER TABLE profiles ADD COLUMN paid_until DATETIME NULL`,
  // اشتراك باقات الهويات الموحّدة على مستوى العضو: نهاية الاشتراك + عدد الحسابات الممنوحة + اسم الباقة
  `ALTER TABLE users ADD COLUMN identity_paid_until DATETIME NULL`,
  `ALTER TABLE users ADD COLUMN identity_accounts INT NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN identity_plan VARCHAR(24) NULL`,
  // الإعلان يحمل هوية نشره — null = إعلان قديم يُنسب لهوية صاحبه الافتراضية عند العرض
  `ALTER TABLE ads ADD COLUMN profile_id BIGINT NULL`,
  // كشف العقار: علم يُحسب من نص الإعلان — لإيقاف/إلزام الإعلانات العقارية بالترخيص
  `ALTER TABLE ads ADD COLUMN is_realestate TINYINT NOT NULL DEFAULT 0`,
  `CREATE INDEX ads_is_realestate ON ads (is_realestate)`,
  // بيانات العقار (المنصّة العقارية): النوع + المساحة + رقم ترخيص الإعلان (فال)
  `ALTER TABLE ads ADD COLUMN re_type VARCHAR(30) NULL`,
  `ALTER TABLE ads ADD COLUMN re_area INT NULL`,
  `ALTER TABLE ads ADD COLUMN re_license VARCHAR(60) NULL`,
  `ALTER TABLE ads ADD COLUMN re_plot VARCHAR(40) NULL`,
  `ALTER TABLE ads ADD COLUMN re_plan VARCHAR(60) NULL`,
  `ALTER TABLE ads ADD COLUMN re_deed VARCHAR(60) NULL`,
  // خصائص العقار الإضافية (المنصّة العقارية): غرف/دورات مياه/طابق/عمر/واجهة/شارع/فرش
  `ALTER TABLE ads ADD COLUMN re_beds INT NULL`,
  `ALTER TABLE ads ADD COLUMN re_baths INT NULL`,
  `ALTER TABLE ads ADD COLUMN re_floor VARCHAR(20) NULL`,
  `ALTER TABLE ads ADD COLUMN re_age INT NULL`,
  `ALTER TABLE ads ADD COLUMN re_facade VARCHAR(20) NULL`,
  `ALTER TABLE ads ADD COLUMN re_street INT NULL`,
  `ALTER TABLE ads ADD COLUMN re_furnished TINYINT NULL`,
  `CREATE INDEX ads_profile_id ON ads (profile_id)`,
  // التعليق/التقييم يحمل هوية كاتبه أيضاً (يُعرض باسمها) — null = هوية افتراضية
  `ALTER TABLE comments ADD COLUMN profile_id BIGINT NULL`,
  `ALTER TABLE reviews ADD COLUMN profile_id BIGINT NULL`,
  // تقييم متعدّد المعايير لكل إعلان (تجارب العملاء): مطابقة الواقع/المصداقية/الجودة/التواصل
  `ALTER TABLE review_ads ADD COLUMN star_match TINYINT NULL`,
  `ALTER TABLE review_ads ADD COLUMN star_trust TINYINT NULL`,
  `ALTER TABLE review_ads ADD COLUMN star_quality TINYINT NULL`,
  `ALTER TABLE review_ads ADD COLUMN star_comm TINYINT NULL`,
  `ALTER TABLE review_ads ADD COLUMN profile_id BIGINT NULL`,
  `ALTER TABLE review_ads ADD COLUMN recommend TINYINT NULL`,
  // صفقة موثّقة: أكّد المُقيّم أنه تعامل مع البائع فعلاً
  `ALTER TABLE review_ads ADD COLUMN verified_deal TINYINT NULL`,
  // دمج الحسابات: حساب قديم دُمج في حساب موحّد → معرّف الحساب الأساسي (يُمنع دخوله)
  `ALTER TABLE users ADD COLUMN merged_into BIGINT NULL`,
  // توثيق الحساب الرئيسي (تأكيد الجوال برمز) قبل ربط بقية الحسابات — «تم التحقق»
  `ALTER TABLE users ADD COLUMN primary_verified TINYINT NOT NULL DEFAULT 0`,
  // المنصّة العقارية: رقم ترخيص العقار (فال) يُدخل مرّة عند التسجيل ويُشترط لإضافة عقار
  `ALTER TABLE users ADD COLUMN re_license VARCHAR(60) NULL`,
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
  await backfillLegacyReceiptHashes();
  // المنصّة العقارية المستقلّة (beta): بيئة مخصّصة للعقار فقط — لا نعرض بيانات الأرشيف
  // العام (سيارات/أجهزة/…). REALESTATE_ONLY=1 يبدأ بصفحة نظيفة: كل الإعلانات القائمة
  // تُخفى (is_realestate=0) ولا يظهر إلا ما يُضاف عبر نموذج العقار المرخّص. الإنتاج لا
  // يضبط هذا المتغيّر → يبقى سلوكه كما هو (وسم العقارات القائمة لإيقافها عند الحاجة).
  if (process.env.REALESTATE_ONLY === '1') {
    await cleanSlateRealEstate();
  } else {
    await backfillRealEstateFlag();
  }
}

/** المنصّة العقارية المستقلّة فقط: تنظيف لمرّة واحدة يُخفي كل إعلانات الأرشيف العام
 *  (is_realestate=0) فلا يظهر إلا العقار المُضاف عبر النموذج المرخّص. مُحصّن بعلامة في
 *  site_settings كي لا يتكرّر ولا يمسّ العقارات المُضافة لاحقاً. لا يعمل إلا حين
 *  REALESTATE_ONLY=1 (بيئة beta) — الإنتاج غير متأثّر إطلاقاً. */
async function cleanSlateRealEstate(): Promise<void> {
  const done = await prisma
    .$queryRawUnsafe<{ v: string | null }[]>(
      `SELECT v FROM site_settings WHERE k = 'realestate_clean_slate_done' LIMIT 1`,
    )
    .catch(() => [] as { v: string | null }[]);
  if (done.length && done[0]?.v === '1') return;
  await prisma.$executeRawUnsafe(`UPDATE ads SET is_realestate = 0 WHERE is_realestate = 1`).catch(() => {});
  await prisma
    .$executeRawUnsafe(
      `INSERT INTO site_settings (k, v) VALUES ('realestate_clean_slate_done', '1') ON DUPLICATE KEY UPDATE v = '1'`,
    )
    .catch(() => {});
}

/** ترقيع لمرة واحدة: وسم الإعلانات العقارية القائمة بعد إضافة عمود is_realestate،
 *  حتى يشملها إيقاف العقار فوراً عند تفعيله من الإدارة. يُنفَّذ مرّة واحدة فقط
 *  (بعلامة في site_settings) كي لا يُلغي أي تصحيح يدوي لاحق من الإدارة. الكلمات
 *  ثابتة في الكود (لا مدخلات مستخدم) فاستعمالها في LIKE آمن. */
async function backfillRealEstateFlag(): Promise<void> {
  const done = await prisma
    .$queryRawUnsafe<{ v: string | null }[]>(
      `SELECT v FROM site_settings WHERE k = 'realestate_backfill_done' LIMIT 1`,
    )
    .catch(() => [] as { v: string | null }[]);
  if (done.length && done[0]?.v === '1') return;
  // نسخ صريحة للتهجئة (LIKE لا يوحّد الألف/التاء) — تطابق الكلمات القاطعة في src/lib/realestate.ts
  const kws = [
    'عقار', 'شقة', 'شقه', 'شقق', 'فيلا', 'فله', 'فلل', 'دوبلكس', 'عمارة', 'عماره',
    'عمائر', 'تمليك', 'استراحة', 'استراحه', 'شاليه', 'بنتهاوس', 'بيت شعبي', 'دور علوي',
    'دور ارضي', 'دور أرضي', 'مزرعة', 'مزرعه', 'اراضي', 'أراضي', 'قطعة ارض', 'قطعه ارض',
    'مخطط سكني', 'غرفة وصالة', 'غرفه وصاله',
  ];
  const like = kws.map((k) => `title LIKE '%${k}%' OR detail LIKE '%${k}%'`).join(' OR ');
  await prisma
    .$executeRawUnsafe(`UPDATE ads SET is_realestate = 1 WHERE is_realestate = 0 AND (${like})`)
    .catch(() => {});
  await prisma
    .$executeRawUnsafe(
      `INSERT INTO site_settings (k, v) VALUES ('realestate_backfill_done', '1') ON DUPLICATE KEY UPDATE v = '1'`,
    )
    .catch(() => {});
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

/** ترقيع لمرة واحدة: بصمات إيصالات الشحن القديمة (aHash 8×8 وحدها، 16 حرفاً) تُصفَّر
 *  لتُعاد حسابتها تلقائياً بالبصمة المركّبة الأدق الجديدة (128 حرفاً) — لا تُقارَن بصمة
 *  قديمة بأخرى جديدة (طولان مختلفان) فيبقى الكشف غير فعّال لولا هذا الترقيع. */
async function backfillLegacyReceiptHashes(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE wallet_topups SET receipt_hash = NULL WHERE receipt_hash IS NOT NULL AND receipt_hash != '-' AND CHAR_LENGTH(receipt_hash) < 100`,
  ).catch(() => {});
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

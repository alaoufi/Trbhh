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
  `CREATE TABLE IF NOT EXISTS store_visits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    store_id BIGINT UNSIGNED NOT NULL,
    viewer VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX store_visits_store (store_id),
    INDEX store_visits_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `ALTER TABLE store_visits ADD COLUMN source VARCHAR(20) NULL`,
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

  /* ---- moderation ---- */
  `ALTER TABLE users ADD COLUMN ban_until DATETIME NULL`,
  /* ---- wallet / credit (رصيد) ---- */
  `ALTER TABLE users ADD COLUMN balance INT NOT NULL DEFAULT 0`,
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
    v VARCHAR(255) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS banned_words (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    word VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
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
  `ALTER TABLE chats MODIFY message TEXT`,
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

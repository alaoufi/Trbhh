/** Additive only; main schema-sync must execute these before enabling categories. */
export const CATEGORY_DDL = [
  `CREATE TABLE IF NOT EXISTS ad_category_definitions (subcategory_id BIGINT UNSIGNED PRIMARY KEY, version INT NOT NULL DEFAULT 1, kind VARCHAR(16) NOT NULL DEFAULT 'other', price_enabled TINYINT NOT NULL DEFAULT 1, goods_enabled TINYINT NOT NULL DEFAULT 0, fields_json JSON NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS ad_category_values (ad_id BIGINT UNSIGNED PRIMARY KEY, subcategory_id BIGINT UNSIGNED NOT NULL, definition_version INT NOT NULL, values_json JSON NOT NULL, KEY ad_category_values_sub (subcategory_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS ad_category_audit (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, actor_id BIGINT UNSIGNED NOT NULL, action VARCHAR(40) NOT NULL, payload JSON NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
] as const;

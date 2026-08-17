-- Dynamic Ads pilot: independent from legacy ads and safe to execute repeatedly.
CREATE TABLE IF NOT EXISTS dynamic_entities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_key VARCHAR(64) NOT NULL,
  name_ar VARCHAR(120) NOT NULL,
  icon VARCHAR(16) NOT NULL DEFAULT '📦',
  is_active TINYINT NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY dynamic_entity_key (entity_key),
  KEY dynamic_entity_active_order (is_active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dynamic_entity_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_id BIGINT UNSIGNED NOT NULL,
  group_key VARCHAR(64) NOT NULL,
  label_ar VARCHAR(120) NOT NULL,
  input_order INT NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY dynamic_entity_group_key (entity_id, group_key),
  KEY dynamic_entity_group_order (entity_id, is_active, input_order, display_order),
  CONSTRAINT dynamic_entity_groups_entity_fk FOREIGN KEY (entity_id) REFERENCES dynamic_entities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dynamic_entity_fields (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_id BIGINT UNSIGNED NOT NULL,
  field_key VARCHAR(64) NOT NULL,
  label_ar VARCHAR(120) NOT NULL,
  field_type VARCHAR(20) NOT NULL,
  required_flag TINYINT NOT NULL DEFAULT 0,
  searchable_flag TINYINT NOT NULL DEFAULT 1,
  options_json JSON NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY dynamic_entity_field_key (entity_id, field_key),
  KEY dynamic_entity_field_order (entity_id, is_active, display_order),
  CONSTRAINT dynamic_entity_fields_entity_fk FOREIGN KEY (entity_id) REFERENCES dynamic_entities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE dynamic_entity_fields ADD COLUMN IF NOT EXISTS group_id BIGINT UNSIGNED NULL AFTER entity_id;
ALTER TABLE dynamic_entity_fields ADD COLUMN IF NOT EXISTS placeholder_ar VARCHAR(255) NULL AFTER options_json;
ALTER TABLE dynamic_entity_fields ADD COLUMN IF NOT EXISTS input_order INT NOT NULL DEFAULT 0 AFTER display_order;
ALTER TABLE dynamic_entity_fields ADD COLUMN IF NOT EXISTS input_visible_flag TINYINT NOT NULL DEFAULT 1 AFTER input_order;
ALTER TABLE dynamic_entity_fields ADD COLUMN IF NOT EXISTS display_visible_flag TINYINT NOT NULL DEFAULT 1 AFTER input_visible_flag;
CREATE INDEX IF NOT EXISTS dynamic_entity_field_group_order ON dynamic_entity_fields (entity_id, group_id, is_active, input_order, display_order);

CREATE TABLE IF NOT EXISTS dynamic_advertisements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(12,2) NULL,
  location_text VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  detected_entity_key VARCHAR(64) NULL,
  confidence DECIMAL(5,2) NOT NULL DEFAULT 0,
  quality_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
  extracted_json JSON NULL,
  missing_json JSON NULL,
  suggestions_json JSON NULL,
  values_json JSON NULL,
  fingerprint CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY dynamic_ad_user_status (user_id, status, updated_at),
  KEY dynamic_ad_entity_status (entity_id, status, updated_at),
  KEY dynamic_ad_fingerprint (fingerprint),
  CONSTRAINT dynamic_ads_entity_fk FOREIGN KEY (entity_id) REFERENCES dynamic_entities(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dynamic_ad_values (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  advertisement_id BIGINT UNSIGNED NOT NULL,
  field_id BIGINT UNSIGNED NOT NULL,
  value_text VARCHAR(1024) NULL,
  value_number DECIMAL(14,2) NULL,
  value_boolean TINYINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY dynamic_ad_value_field (advertisement_id, field_id),
  KEY dynamic_ad_value_text (field_id, value_text(191)),
  KEY dynamic_ad_value_number (field_id, value_number),
  CONSTRAINT dynamic_ad_values_ad_fk FOREIGN KEY (advertisement_id) REFERENCES dynamic_advertisements(id) ON DELETE CASCADE,
  CONSTRAINT dynamic_ad_values_field_fk FOREIGN KEY (field_id) REFERENCES dynamic_entity_fields(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dynamic_analysis_feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  advertisement_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  selected_entity_id BIGINT UNSIGNED NULL,
  detected_entity_key VARCHAR(64) NULL,
  feedback_type VARCHAR(32) NOT NULL,
  payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY dynamic_feedback_ad (advertisement_id, created_at),
  CONSTRAINT dynamic_feedback_ad_fk FOREIGN KEY (advertisement_id) REFERENCES dynamic_advertisements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO dynamic_entities (entity_key, name_ar, icon, display_order) VALUES
  ('vehicle', 'مركبة', '🚗', 10), ('property', 'عقار', '🏠', 20), ('livestock', 'حلال', '🐪', 30),
  ('product', 'أجهزة ومنتجات', '📱', 40), ('service', 'خدمات', '🛠️', 50), ('equipment', 'معدات', '🚜', 60), ('other', 'أخرى', '📦', 70)
ON DUPLICATE KEY UPDATE name_ar=VALUES(name_ar), icon=VALUES(icon), display_order=VALUES(display_order);

INSERT INTO dynamic_entity_groups (entity_id, group_key, label_ar, input_order, display_order)
SELECT id, 'basic', 'البيانات الأساسية', 10, 10 FROM dynamic_entities
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar);
INSERT INTO dynamic_entity_groups (entity_id, group_key, label_ar, input_order, display_order)
SELECT id, 'specs', 'المواصفات والتفاصيل', 20, 20 FROM dynamic_entities
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar);
INSERT INTO dynamic_entity_groups (entity_id, group_key, label_ar, input_order, display_order)
SELECT id, 'location', 'الموقع', 30, 30 FROM dynamic_entities
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar);
UPDATE dynamic_entity_fields f JOIN dynamic_entity_groups g ON g.entity_id=f.entity_id AND g.group_key='specs' SET f.group_id=g.id, f.input_order=CASE WHEN f.input_order=0 THEN f.display_order ELSE f.input_order END WHERE f.group_id IS NULL;

INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'manufacturer', 'الشركة المصنعة', 'text', 0, 1, NULL, 10 FROM dynamic_entities WHERE entity_key='vehicle'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), field_type=VALUES(field_type);
INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'year', 'السنة', 'number', 0, 1, NULL, 20 FROM dynamic_entities WHERE entity_key='vehicle'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), field_type=VALUES(field_type);
INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'mileage', 'العداد', 'number', 0, 1, NULL, 30 FROM dynamic_entities WHERE entity_key='vehicle'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), field_type=VALUES(field_type);
INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'condition', 'الحالة', 'select', 0, 1, JSON_ARRAY('جديد','مستعمل'), 40 FROM dynamic_entities WHERE entity_key='vehicle'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), options_json=VALUES(options_json);

INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'property_type', 'نوع العقار', 'select', 1, 1, JSON_ARRAY('شقة','فيلا','أرض','عمارة','مكتب','محل'), 10 FROM dynamic_entities WHERE entity_key='property'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), options_json=VALUES(options_json);
INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'purpose', 'للبيع أو للإيجار', 'select', 1, 1, JSON_ARRAY('للبيع','للإيجار'), 20 FROM dynamic_entities WHERE entity_key='property'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), options_json=VALUES(options_json);
INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'area_sqm', 'المساحة (م²)', 'number', 0, 1, NULL, 30 FROM dynamic_entities WHERE entity_key='property'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), field_type=VALUES(field_type);
INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'rooms', 'عدد الغرف', 'number', 0, 1, NULL, 40 FROM dynamic_entities WHERE entity_key='property'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), field_type=VALUES(field_type);

INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'livestock_type', 'نوع الحلال', 'select', 1, 1, JSON_ARRAY('إبل','غنم','ماعز','أبقار'), 10 FROM dynamic_entities WHERE entity_key='livestock'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), options_json=VALUES(options_json);
INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'breed', 'السلالة', 'text', 0, 1, NULL, 20 FROM dynamic_entities WHERE entity_key='livestock'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), field_type=VALUES(field_type);
INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'gender', 'الجنس', 'select', 0, 1, JSON_ARRAY('ذكر','أنثى'), 30 FROM dynamic_entities WHERE entity_key='livestock'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), options_json=VALUES(options_json);
INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'age', 'العمر', 'text', 0, 1, NULL, 40 FROM dynamic_entities WHERE entity_key='livestock'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), field_type=VALUES(field_type);

INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'brand', 'العلامة أو النوع', 'text', 0, 1, NULL, 10 FROM dynamic_entities WHERE entity_key IN ('product','equipment')
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), field_type=VALUES(field_type);
INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'condition', 'الحالة', 'select', 0, 1, JSON_ARRAY('جديد','مستعمل'), 20 FROM dynamic_entities WHERE entity_key IN ('product','equipment')
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), options_json=VALUES(options_json);
INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'service_type', 'نوع الخدمة', 'text', 1, 1, NULL, 10 FROM dynamic_entities WHERE entity_key='service'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), field_type=VALUES(field_type);
INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'delivery_mode', 'طريقة تقديم الخدمة', 'select', 0, 1, JSON_ARRAY('عن بعد','في الموقع','كلاهما'), 20 FROM dynamic_entities WHERE entity_key='service'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), options_json=VALUES(options_json);
INSERT INTO dynamic_entity_fields (entity_id, field_key, label_ar, field_type, required_flag, searchable_flag, options_json, display_order)
SELECT id, 'notes', 'ملاحظات إضافية', 'textarea', 0, 0, NULL, 10 FROM dynamic_entities WHERE entity_key='other'
ON DUPLICATE KEY UPDATE label_ar=VALUES(label_ar), field_type=VALUES(field_type);

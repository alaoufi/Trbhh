import 'server-only';
/** Additional registration details; supplier, OAuth and catalog remain authoritative. */
export const ONBOARDING_DDL=[`CREATE TABLE IF NOT EXISTS supplier_onboarding (
 supplier_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 registration_number VARCHAR(10) COLLATE utf8mb4_bin NOT NULL,
 store_url VARCHAR(300) COLLATE utf8mb4_bin NOT NULL,
 encrypted_details MEDIUMTEXT NOT NULL,
 revision INT NOT NULL DEFAULT 1,
 checked_connection_version INT NULL,
 checked_at DATETIME(3) NULL,
 check_status VARCHAR(24) NOT NULL DEFAULT 'pending',
 check_code VARCHAR(80) NOT NULL DEFAULT '',
 check_sample_count INT NOT NULL DEFAULT 0,
 check_claim VARCHAR(36) NULL,
 check_claimed_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY supplier_onboarding_registration (registration_number),
 UNIQUE KEY supplier_onboarding_store (store_url),
 CONSTRAINT supplier_onboarding_supplier_fk FOREIGN KEY (supplier_id) REFERENCES commerce_suppliers(id) ON DELETE RESTRICT
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
`CREATE TABLE IF NOT EXISTS supplier_data_invitations (
 supplier_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 token_hash BINARY(32) NOT NULL UNIQUE,
 generation INT NOT NULL DEFAULT 1,
 status VARCHAR(24) NOT NULL DEFAULT 'open',
 encrypted_draft MEDIUMTEXT NULL,
 expires_at DATETIME(3) NOT NULL,
 issued_by BIGINT UNSIGNED NOT NULL,
 submitted_at DATETIME(3) NULL,
 approved_at DATETIME(3) NULL,
 approved_by BIGINT UNSIGNED NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY supplier_data_invitation_status (status,updated_at),
 CONSTRAINT supplier_data_invitation_supplier_fk FOREIGN KEY (supplier_id) REFERENCES commerce_suppliers(id) ON DELETE RESTRICT
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`];

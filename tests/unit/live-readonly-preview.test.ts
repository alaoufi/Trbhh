import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const root = process.cwd();

describe('Hostinger live-data read-only preview', () => {
  test('disables boot-time schema writes and rejects non-read HTTP methods', () => {
    const instrumentation = readFileSync(path.join(root, 'src/instrumentation.ts'), 'utf8');
    const schemaSync = readFileSync(path.join(root, 'src/data/schema-sync.ts'), 'utf8');
    const middleware = readFileSync(path.join(root, 'src/middleware.ts'), 'utf8');
    const commerceConfig = readFileSync(path.join(root, 'src/lib/commerce/config.ts'), 'utf8');

    expect(instrumentation).toContain('isReadOnlyPreview()');
    expect(schemaSync).toContain('if (isReadOnlyPreview()) return Promise.resolve();');
    expect(middleware).toContain('readOnlyPreviewResponse(req.method)');
    expect(middleware).toContain("'X-Trbhh-Preview-Mode', 'read-only'");
    expect(commerceConfig).toContain("purchasingEnabled: process.env.TRBHH_READ_ONLY_PREVIEW !== '1'");
  });

  test('creates a database principal with read privileges only and redacts its secret', async () => {
    const script = path.join(root, 'scripts/release/configure-live-readonly-preview.cjs');
    expect(existsSync(script)).toBe(true);
    if (!existsSync(script)) return;

    const { buildStatements, emitSql, validateGrantReport } = await import(script) as {
      buildStatements(input: { database: string; username: string; password: string }): string[];
      emitSql(input: { database: string; username: string; password: string }): string;
      validateGrantReport(grants: string[], database: string): boolean;
    };
    const statements = buildStatements({ database: 'trbhh_live', username: 'trbhh_preview_ro', password: 'Secret123456' });
    const sql = statements.join('\n');

    expect(sql).toContain('REVOKE ALL PRIVILEGES, GRANT OPTION');
    expect(sql).toContain('GRANT SELECT, SHOW VIEW');
    expect(sql).not.toMatch(/GRANT[^\n]*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRIGGER|EXECUTE)/i);
    expect(() => buildStatements({ database: 'bad-name', username: 'trbhh_preview_ro', password: 'Secret123456' })).toThrow();
    expect(() => buildStatements({ database: 'trbhh_live', username: 'trbhh_preview_ro', password: "bad'pass" })).toThrow();
    expect(validateGrantReport(["GRANT SELECT, SHOW VIEW ON `trbhh_live`.* TO `trbhh_preview_ro`@`%`"], 'trbhh_live')).toBe(true);
    expect(validateGrantReport(["GRANT SELECT, INSERT ON `trbhh_live`.* TO `trbhh_preview_ro`@`%`"], 'trbhh_live')).toBe(false);
    expect(emitSql({ database: 'trbhh_live', username: 'trbhh_preview_ro', password: 'Secret123456' })).toMatch(/;\n$/);
    expect(JSON.stringify({ statements: statements.map((statement) => statement.replace(/IDENTIFIED BY '.+?'/, "IDENTIFIED BY '[REDACTED]'")) })).not.toContain('Secret123456');
  });

  test('deploy workflow pins the requested commit and never runs migrations or category seeds in live-readonly mode', () => {
    const workflow = readFileSync(path.join(root, '.github/workflows/deploy-staging.yml'), 'utf8');

    expect(workflow).toContain('live_read_only');
    expect(workflow).toContain('set_env TRBHH_READ_ONLY_PREVIEW 1');
    expect(workflow).toContain('set_env SUPPLIER_ALLOW_LIVE_ORDERS false');
    expect(workflow).toContain('github.sha');
    expect(workflow).toContain('docker exec -i "$container" node -');
    expect(workflow).toContain('docker cp "$readonly_script" "$prod_container:$container_script"');
    expect(workflow).toContain('master_credentials=$(clpctl db:show:master-credentials)');
    expect(workflow).toContain('MYSQL_PWD="$master_password" mysql');
    expect(workflow).toContain('"$prod_container" node "$container_script" --emit-sql');
    expect(workflow).not.toContain('"$prod_container" node - < "$readonly_script"');
    expect(workflow).toContain("SELECT COUNT(*) AS count FROM categories");
    expect(workflow).not.toContain("SELECT COUNT(*) AS count FROM ad_categories");
    expect(workflow).toContain('grants.flatMap((row)=>Object.values(row).map(String))');
    expect(workflow).not.toMatch(/prisma\s+migrate\s+(dev|reset|deploy)/);
    expect(workflow).not.toMatch(/prisma\s+db\s+push/);
  });
});

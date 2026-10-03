import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { readOnlyPreviewResponse } from '@/lib/read-only-preview';

const root = process.cwd();

describe('Hostinger live-data read-only preview', () => {
  test('passes the independent preview marker into the staging container',()=>{
    const compose=readFileSync('docker-compose.staging.yml','utf8');
    expect(compose).toContain('TRBHH_PREVIEW_MODE: "${TRBHH_PREVIEW_MODE:-1}"');
  });
  test('allows only login actions while keeping every other write blocked', () => {
    process.env.TRBHH_READ_ONLY_PREVIEW = '1';
    expect(readOnlyPreviewResponse('POST', '/login')).toBeNull();
    expect(readOnlyPreviewResponse('POST', '/store-login')).toBeNull();
    expect(readOnlyPreviewResponse('POST', '/admin/categories')).toBeNull();
    expect(readOnlyPreviewResponse('POST', '/register')?.status).toBe(405);
    expect(readOnlyPreviewResponse('POST', '/api/integrations/salla/webhooks')?.status).toBe(405);
  });

  test('applies preview-only category visibility without changing the database records', async () => {
    const preview = await import('@/lib/read-only-preview') as Record<string, unknown>;
    const apply = preview.applyPreviewCategoryVisibility;
    const parse = preview.parsePreviewCategoryVisibility;
    expect(typeof apply).toBe('function');
    expect(typeof parse).toBe('function');
    if (typeof apply !== 'function' || typeof parse !== 'function') return;

    const categories = [
      { id: 10, name: 'ظاهر في القاعدة', active: true, order: 1 },
      { id: 20, name: 'مخفي في القاعدة', active: false, order: 2 },
    ];
    const subcategories = [
      { id: 101, categoryId: 10, name: 'فرع ظاهر', active: true, order: 1 },
      { id: 102, categoryId: 10, name: 'فرع مخفي', active: false, order: 2 },
    ];
    const overrides = parse({
      'category:10': '0',
      'category:20': '1',
      'subcategory:101': '0',
      'subcategory:102': '1',
      invalid: '1',
    });

    expect(apply(categories, subcategories, overrides)).toEqual({
      categories: [
        { ...categories[0], active: false },
        { ...categories[1], active: true },
      ],
      subcategories: [
        { ...subcategories[0], active: false },
        { ...subcategories[1], active: true },
      ],
    });
    expect(categories[0].active).toBe(true);
    expect(subcategories[0].active).toBe(true);
  });

  test('persists isolated preview state outside MySQL', async () => {
    const cache = await import('@/lib/redis') as Record<string, unknown>;
    const read = cache.previewHashGetAll;
    const write = cache.previewHashSet;
    expect(typeof read).toBe('function');
    expect(typeof write).toBe('function');
    if (typeof read !== 'function' || typeof write !== 'function') return;

    const key = `test:preview:${crypto.randomUUID()}`;
    await write(key, 'category:10', '0');
    await write(key, 'subcategory:101', '1');
    expect(await read(key)).toEqual({ 'category:10': '0', 'subcategory:101': '1' });
  });

  test('disables boot-time schema writes and rejects non-read HTTP methods', () => {
    const instrumentation = readFileSync(path.join(root, 'src/instrumentation.ts'), 'utf8');
    const schemaSync = readFileSync(path.join(root, 'src/data/schema-sync.ts'), 'utf8');
    const middleware = readFileSync(path.join(root, 'src/middleware.ts'), 'utf8');
    const commerceConfig = readFileSync(path.join(root, 'src/lib/commerce/config.ts'), 'utf8');

    expect(instrumentation).toContain('isReadOnlyPreview()');
    expect(schemaSync).toContain('if (isReadOnlyPreview()) return Promise.resolve();');
    expect(middleware).toContain('readOnlyPreviewResponse(req.method, req.nextUrl.pathname)');
    expect(middleware).toContain("'X-Trbhh-Preview-Mode', 'read-only'");
    expect(commerceConfig).toContain("purchasingEnabled: process.env.TRBHH_READ_ONLY_PREVIEW !== '1'");
  });

  test('explains preview-only category changes without implying production was edited', () => {
    const page = readFileSync(path.join(root, 'src/app/admin/categories/workspace.tsx'), 'utf8');
    expect(page).toContain('تم تحديث الظهور في المعاينة فقط');
    expect(page).toContain('قاعدة الإنتاج لم تتغير');
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
    expect(workflow).toContain('set_env TRBHH_PREVIEW_MODE 1 .env');
    expect(workflow).toContain('set_env SUPPLIER_ALLOW_LIVE_ORDERS false');
    expect(workflow).toContain('set_env AUTH_SECRET "$staging_auth_secret" .env');
    expect(workflow).toContain("(process.env.AUTH_SECRET||'').length<32");
    expect(workflow).toContain('github.sha');
    expect(workflow).toContain('docker exec -i "$container" node -');
    expect(workflow).toContain('docker cp "$readonly_script" "$prod_container:$container_script"');
    expect(workflow).toContain('master_credentials=$(clpctl db:show:master-credentials)');
    expect(workflow).toContain('MYSQL_PWD="$master_password" mysql');
    expect(workflow).toContain('"$prod_container" node "$container_script" --emit-sql');
    expect(workflow).not.toContain('"$prod_container" node - < "$readonly_script"');
    expect(workflow).toContain("SELECT COUNT(*) AS count FROM categories");
    expect(workflow).toContain('COUNT(a.id) AS ad_count');
    expect(workflow).toContain('GROUP BY c.id,c.name,c.is_active');
    expect(workflow).not.toContain("SELECT COUNT(*) AS count FROM ad_categories");
    expect(workflow).toContain('grants.flatMap((row)=>Object.values(row).map(String))');
    expect(workflow).not.toMatch(/prisma\s+migrate\s+(dev|reset|deploy)/);
    expect(workflow).not.toMatch(/prisma\s+db\s+push/);
  });

  test('restores the isolated staging database after leaving live-readonly mode', () => {
    const workflow = readFileSync(path.join(root, '.github/workflows/deploy-staging.yml'), 'utf8');

    expect(workflow).toContain('read_env_value DB_USER .env');
    expect(workflow).toContain('read_env_value DB_PASSWORD .env');
    expect(workflow).toContain('read_env_value DB_NAME .env');
    expect(workflow).toContain('urlencode_env_value "$staging_db_user"');
    expect(workflow).toContain('urlencode_env_value "$staging_db_password"');
    expect(workflow).toContain('set_env DATABASE_URL "$staging_database_url" .env');
    expect(workflow).toContain('set_env LEGACY_MEDIA_BASE "" .env');
    expect(workflow).toContain('set_env NEXT_PUBLIC_MEDIA_BASE "" .env');
  });

  test('packages the read-only quality audit without granting it a write path', () => {
    const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');
    const audit = readFileSync(path.join(root, 'scripts/release/audit-live-ad-quality.cjs'), 'utf8');
    expect(dockerfile).toContain('audit-live-ad-quality.cjs');
    expect(audit).toContain('SHOW GRANTS FOR CURRENT_USER()');
    expect(audit).toContain('audit_requires_read_only_database_user');
    expect(audit).not.toMatch(/\$executeRaw|\b(UPDATE|DELETE|INSERT|DROP|TRUNCATE|ALTER)\s+(TABLE|FROM|INTO|ads)\b/i);
  });

  test('publishes the read-only preview through a direct public HTTPS reverse proxy', () => {
    const compose = readFileSync(path.join(root, 'docker-compose.staging.yml'), 'utf8');
    const workflow = readFileSync(path.join(root, '.github/workflows/deploy-staging.yml'), 'utf8');

    expect(compose).not.toContain('cloudflare/cloudflared');
    expect(workflow).toContain("preview_domain='preview.88-223-92-124.sslip.io'");
    expect(workflow).toContain('site:add:reverse-proxy');
    expect(workflow).toContain("--reverseProxyUrl='http://127.0.0.1:3081'");
    expect(workflow).toContain('lets-encrypt:install:certificate');
    expect(workflow).toContain("preview_url=\"https://$preview_domain\"");
    expect(workflow).toContain('for attempt in $(seq 1 12)');
    expect(workflow).toContain('test "$preview_https_status" = 200');
    expect(workflow).toContain('test "$external_preview_mode" = read-only');
    expect(workflow).toContain('PREVIEW_URL=');
  });

  test('requires an anonymous external GET to return 200 even for review bots', () => {
    const workflow = readFileSync(path.join(root, '.github/workflows/deploy-staging.yml'), 'utf8');

    expect(workflow).toContain("-H 'Cookie:'");
    expect(workflow).toContain("-H 'Authorization:'");
    expect(workflow).toContain("-A 'GPTBot/1.0'");
    expect(workflow).toContain('test "$anonymous_status" = 200');
    expect(workflow).toContain("! grep -qi '^www-authenticate:'");
  });

  test('fails staging deployment when a required route renders a soft 404 body', () => {
    const workflow = readFileSync(path.join(root, '.github/workflows/deploy-staging.yml'), 'utf8');

    expect(workflow).toContain('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(workflow).toContain('This page could not be found');
    expect(workflow).toContain('preview-route-body');
  });

  test('records listener, Docker publication and firewall diagnostics without changing production', () => {
    const workflow = readFileSync(path.join(root, '.github/workflows/deploy-staging.yml'), 'utf8');

    expect(workflow).toContain("ss -lntp | grep -E '(^|:)3081\\b'");
    expect(workflow).toContain('docker compose -p trbhh-staging');
    expect(workflow).toContain('docker port "$container" 3000');
    expect(workflow).toContain('ufw status verbose');
    expect(workflow).toContain('iptables -S');
    expect(workflow).toContain('nft list ruleset');
    expect(workflow).not.toContain('ufw allow 3081');
  });
});

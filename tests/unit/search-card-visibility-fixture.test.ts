import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { isolatedSearchUrl, searchAdsDdl, SEARCH_FIXTURE_DATABASE } from '../helpers/search-visibility-fixture';

describe('isolated search visibility fixture safety', () => {
  it.each([
    undefined, '', 'not a URL',
    'mysql://root:test@example.com:33309/trbhh_search_visibility_test',
    'mysql://root:test@localhost:33309/trbhh_search_visibility_test',
    'mysql://root:test@127.0.0.1:3306/trbhh_search_visibility_test',
    'mysql://root:test@127.0.0.1:33309/production',
    'mysql://root:test@127.0.0.1:33309/trbhh_commerce_preview_20260919',
    'mysql://root:test@127.0.0.1:33309/trbhh_search_visibility_test/other',
    'mysql://root:test@127.0.0.1:33309/trbhh_search_visibility_test?schema=production',
    'mysql://root:test@127.0.0.1:33309/trbhh_search_visibility_test#production',
    'postgres://root:test@127.0.0.1:33309/trbhh_search_visibility_test',
    'mysql://root@127.0.0.1:33309/trbhh_search_visibility_test',
    'mysql://app:test@127.0.0.1:33309/trbhh_search_visibility_test',
  ])('refuses unsafe targets without connecting: %s', raw => {
    expect(() => isolatedSearchUrl(raw)).toThrow('Refusing non-isolated search DB');
  });
  it('accepts only the explicit disposable root URL', () => {
    expect(isolatedSearchUrl('mysql://root:test@127.0.0.1:33309/trbhh_search_visibility_test').pathname).toBe(`/${SEARCH_FIXTURE_DATABASE}`);
  });
  it('derives only the ads table from the current Prisma schema without connecting', () => {
    const sql = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], {
      encoding: 'utf8', timeout: 20000,
      env: { ...process.env, DATABASE_URL: 'mysql://fixture:fixture@127.0.0.1:33309/trbhh_search_visibility_test' },
    });
    const ddl = searchAdsDdl(sql);
    expect(ddl.match(/CREATE TABLE/g)).toHaveLength(1);
    for (const column of ['id', 'user_id', 'created_at', 'status', 'store_only', 'trbhh_until', 'adsSpecial', 'expires_at', 'urgent_until']) expect(ddl).toContain(`\`${column}\``);
    expect(ddl).toContain("`state` ENUM('0', '1')");
    expect(ddl).not.toContain('ALTER TABLE');
    expect(ddl).not.toContain('DROP');
  });
  it('refuses missing or ambiguous table output', () => {
    const statement = 'CREATE TABLE `ads` (\n`id` BIGINT\n) DEFAULT CHARACTER SET utf8mb4;';
    expect(() => searchAdsDdl('CREATE TABLE `users` (id BIGINT);')).toThrow('Missing or ambiguous');
    expect(() => searchAdsDdl(`${statement}\n${statement}`)).toThrow('Missing or ambiguous');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('advertisement location privacy schema', () => {
  const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const sync = readFileSync(resolve(process.cwd(), 'src/data/schema-sync.ts'), 'utf8');

  it('stores exact-location consent separately and defaults it to off', () => {
    expect(schema).toContain('model ad_location_privacy');
    expect(schema).toMatch(/show_exact_location_publicly\s+Int\s+@default\(0\)/);
    expect(sync).toContain('CREATE TABLE IF NOT EXISTS ad_location_privacy');
    expect(sync).toContain('show_exact_location_publicly TINYINT NOT NULL DEFAULT 0');
  });
});

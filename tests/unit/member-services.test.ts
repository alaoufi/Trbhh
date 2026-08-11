import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('member service order schema', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const schemaSync = readFileSync('src/data/schema-sync.ts', 'utf8');

  it('defines an indexed service-order model and idempotent table creation', () => {
    expect(schema).toContain('model member_service_orders');
    expect(schema).toContain('@@index([user_id, status]');
    expect(schemaSync).toContain('CREATE TABLE IF NOT EXISTS member_service_orders');
    expect(schemaSync).toContain('member_service_orders_user_status');
  });
});

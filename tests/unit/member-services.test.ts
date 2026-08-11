import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canAcceptMemberServiceOrder } from '@/lib/member-services';

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

describe('member service acceptance guards', () => {
  const now = new Date('2026-08-01T12:00:00Z');

  it('requires a pending, unexpired order and sufficient available balance', () => {
    expect(canAcceptMemberServiceOrder('pending_acceptance', new Date('2026-08-02'), 20, 20, now)).toBe(true);
    expect(canAcceptMemberServiceOrder('pending_acceptance', new Date('2026-08-02'), 19, 20, now)).toBe(false);
    expect(canAcceptMemberServiceOrder('pending_acceptance', new Date('2026-07-31'), 30, 20, now)).toBe(false);
    expect(canAcceptMemberServiceOrder('awaiting_execution', new Date('2026-08-02'), 30, 20, now)).toBe(false);
  });
});

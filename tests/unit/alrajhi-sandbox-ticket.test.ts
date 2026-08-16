import { describe, expect, it } from 'vitest';
import { createSandboxTicket, readSandboxTicket } from '@/lib/payments/alrajhi-sandbox';

describe('Al Rajhi private sandbox ticket', () => {
  it('accepts only an unexpired ticket signed for the originating administrator', () => {
    const ticket = createSandboxTicket({ adminId: 7, trackId: '123456', amountSar: 10, now: 1_000, secret: 'a'.repeat(32) });
    expect(readSandboxTicket(ticket, { now: 1_100, secret: 'a'.repeat(32) })).toMatchObject({ adminId: 7, trackId: '123456', amountSar: 10 });
    expect(readSandboxTicket(ticket, { now: 1_100, secret: 'b'.repeat(32) })).toBeNull();
  });
});

import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

type TicketData = { adminId: number; trackId: string; amountSar: number; expiresAt: number };
type TicketInput = { adminId: number; trackId: string; amountSar: number; now?: number; secret: string };

function sign(encoded: string, secret: string) { return createHmac('sha256', secret).update(encoded).digest('base64url'); }

/** A short-lived, signed test handle. It carries no bank credential and creates no wallet entry. */
export function createSandboxTicket(input: TicketInput): string {
  const data: TicketData = { adminId: input.adminId, trackId: input.trackId, amountSar: input.amountSar, expiresAt: (input.now ?? Date.now()) + 20 * 60_000 };
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${encoded}.${sign(encoded, input.secret)}`;
}

export function readSandboxTicket(ticket: string, input: { now?: number; secret: string }): TicketData | null {
  const [encoded, supplied] = ticket.split('.');
  if (!encoded || !supplied) return null;
  const expected = sign(encoded, input.secret);
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TicketData;
    return Number.isSafeInteger(data.adminId) && /^\d+$/.test(data.trackId) && Number.isFinite(data.amountSar) && data.expiresAt > (input.now ?? Date.now()) ? data : null;
  } catch { return null; }
}

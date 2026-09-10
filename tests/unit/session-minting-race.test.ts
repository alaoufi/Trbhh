import { describe, expect, it, vi } from 'vitest';
const set = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ cookies: async () => ({ set }) }));
vi.mock('@/lib/auth-security', () => ({
  getAuthSessionVersion: async () => 'after-reset',
  sessionMeetsAuthPolicy: async (session: { authVersion?: string }) => session.authVersion === 'after-reset',
}));
import { createSession } from '@/lib/auth';
describe('session minting after concurrent password rotation', () => {
  it('does not upgrade an old password proof to the new credential version', async () => {
    await expect(createSession({ uid: 7, name: 'Tester', type: 'user', authVersion: 'before-reset' })).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth';

vi.mock('@/lib/settings', () => ({ getAuthSecuritySettings: async () => ({ passwordMinimum: 12, requireAdminMfa: false }) }));

describe('new password policy', () => {
  it('rejects the legacy four-digit password when creating a new hash', async () => {
    await expect(hashPassword('4826')).rejects.toThrow();
  });
  it('rejects bcrypt truncation beyond 72 UTF-8 bytes', async () => {
    await expect(hashPassword('عبارة آمنة '.repeat(10))).rejects.toThrow();
  });
  it('accepts a long passphrase without arbitrary ASCII composition rules', async () => {
    const hash = await hashPassword('quiet river bronze orchard');
    expect(await verifyPassword('quiet river bronze orchard', hash)).toBe(true);
  });
  it('still verifies an existing weak password for staged migration', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('4826', 4);
    expect(await verifyPassword('4826', hash)).toBe(true);
  });
});

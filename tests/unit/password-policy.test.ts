import { describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth';

vi.mock('@/lib/settings', () => ({ getAuthSecuritySettings: async () => ({ passwordMinimum: 4, requireAdminMfa: false }) }));

describe('new password policy', () => {
  // قرار المالك (2026-11-02): 4 خانات من أي نوع، بلا شروط أخرى.
  it('rejects a password shorter than four characters', async () => {
    await expect(hashPassword('482')).rejects.toThrow();
  });
  it('accepts any four characters: digits, letters or symbols', async () => {
    for (const plain of ['4826', 'abcd', '@#$%', '1111', 'كلمة']) {
      expect(await verifyPassword(plain, await hashPassword(plain))).toBe(true);
    }
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

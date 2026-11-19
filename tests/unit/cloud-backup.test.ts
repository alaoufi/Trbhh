import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));
import { isCloudBackupKey, isRestorePhrase } from '@/lib/cloud-backup';

describe('cloud backups', () => {
  it('accepts only real backup object names', () => {
    expect(isCloudBackupKey('daily/trbhh-2026-11-19T03-17-00Z.tar.gpg')).toBe(true);
    expect(isCloudBackupKey('manual/trbhh-2026-11-19T18-17-16Z.tar.gpg')).toBe(true);
    expect(isCloudBackupKey('daily/trbhh-2026-11-19T03-17-00Z.json')).toBe(false);
    expect(isCloudBackupKey('daily/../x.tar.gpg')).toBe(false);
    expect(isCloudBackupKey('daily/trbhh-1.tar.gpg; rm -rf /')).toBe(false);
    expect(isCloudBackupKey('other/trbhh-2026.tar.gpg')).toBe(false);
  });
  it('requires the restore phrase, in its common spellings', () => {
    for (const ok of ['استرجاع نسخة', 'استرجاع نسخه', ' استرجاع   نسخة ', 'ارجاع نسخه', 'إرجاع نسخة']) expect(isRestorePhrase(ok)).toBe(true);
    for (const no of ['', 'استرجاع', 'نسخة', 'استعادة', 'yes', 'استرجاع النسخة الآن']) expect(isRestorePhrase(no)).toBe(false);
  });
});

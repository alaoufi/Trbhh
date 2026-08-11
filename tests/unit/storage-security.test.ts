import { describe, expect, it } from 'vitest';
import { isSafeStoragePath } from '@/lib/storage';

describe('storage containment', () => {
  it('accepts a normal relative upload path', () => {
    expect(isSafeStoragePath('C:/app/storage', 'uploads/photo.jpg')).toBe(true);
  });

  it('rejects paths that only share the storage prefix', () => {
    expect(isSafeStoragePath('C:/app/storage', '../storage-private/id.jpg')).toBe(false);
  });

  it('rejects absolute paths and parent traversal', () => {
    expect(isSafeStoragePath('C:/app/storage', 'C:/Windows/win.ini')).toBe(false);
    expect(isSafeStoragePath('C:/app/storage', '../../secret.txt')).toBe(false);
  });
});

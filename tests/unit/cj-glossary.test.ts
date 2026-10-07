import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ rows: [] as Array<{ src_norm: string; source: string; target_ar: string; whole_text: number }> }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cj_glossary: {
      findMany: vi.fn(async () => store.rows),
      count: vi.fn(async () => store.rows.length),
      upsert: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
  },
}));
import { glossaryExact, glossarySubstitute, normalizeGlossaryKey, invalidateGlossaryCache } from '@/lib/cj/glossary';

beforeEach(() => {
  invalidateGlossaryCache();
  store.rows = [
    { src_norm: 'red', source: 'Red', target_ar: 'أحمر', whole_text: 0 },
    { src_norm: 'stainless steel', source: 'Stainless Steel', target_ar: 'ستانلس ستيل', whole_text: 0 },
    { src_norm: 'one size', source: 'One Size', target_ar: 'مقاس واحد', whole_text: 0 },
    { src_norm: 'xxl', source: 'XXL', target_ar: 'كبير جدًا', whole_text: 1 },
  ];
});

describe('CJ glossary', () => {
  it('normalizes keys to lowercase, trimmed, single-spaced', () => {
    expect(normalizeGlossaryKey('  Stainless   Steel ')).toBe('stainless steel');
  });

  it('returns the fixed Arabic for an exact (whole-field) match, case/space-insensitive', async () => {
    expect(await glossaryExact('Red')).toBe('أحمر');
    expect(await glossaryExact('  RED ')).toBe('أحمر');
    expect(await glossaryExact('One Size')).toBe('مقاس واحد');
    expect(await glossaryExact('XXL')).toBe('كبير جدًا');
    expect(await glossaryExact('Blue')).toBeNull();
    expect(await glossaryExact('')).toBeNull();
  });

  it('substitutes known multi-word terms longest-first inside text', async () => {
    expect(await glossarySubstitute('Red Stainless Steel bottle')).toBe('أحمر ستانلس ستيل bottle');
    expect(await glossarySubstitute('One Size cotton')).toBe('مقاس واحد cotton');
  });

  it('respects word boundaries and never replaces a partial match', async () => {
    expect(await glossarySubstitute('Reddish Prepared')).toBe('Reddish Prepared');
  });

  it('excludes exact-only (whole_text) and sub-3-char terms from in-text substitution', async () => {
    // XXL is marked whole_text=1 → used for exact match only, not substituted inside text.
    expect(await glossarySubstitute('XXL cotton shirt')).toBe('XXL cotton shirt');
  });

  it('is a no-op when the glossary is empty', async () => {
    store.rows = [];
    invalidateGlossaryCache();
    expect(await glossarySubstitute('Red bottle')).toBe('Red bottle');
    expect(await glossaryExact('Red')).toBeNull();
  });
});

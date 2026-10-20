import { describe, expect, it } from 'vitest';
import { resolveHomeTheme } from '@/lib/home-theme';

describe('resolveHomeTheme', () => {
  it('keeps an explicit choice of either homepage', () => {
    expect(resolveHomeTheme('market')).toBe('market');
    expect(resolveHomeTheme('classic')).toBe('classic');
  });

  it('defaults missing and unknown homepage preferences to market', () => {
    for (const value of [undefined, '', 'unknown', 'CLASSIC', ' classic ']) {
      expect(resolveHomeTheme(value)).toBe('market');
    }
  });

  it('does not treat existing global visual designs as homepage preferences', () => {
    for (const value of ['aurora', 'shop', 'list', 'flat', 'soft', 'sharp']) {
      expect(resolveHomeTheme(value)).toBe('market');
    }
  });
});

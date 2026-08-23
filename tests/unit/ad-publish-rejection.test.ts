import { describe, expect, it } from 'vitest';
import { adPublishRejection } from '@/lib/ad-publish-rejection';

describe('ad publish rejection guidance', () => {
  it('has an explicit reason and next step for every public rejection code', () => {
    const codes = [
      'missing', 'contact', 'pledge', 'blocked', 'toomany', 'image', 'flood',
      'repeat', 'free-duplicate', 'crossdup', 'needdup', 'needcredit', 'banned',
      'editWindow', 'limit', 'gap',
    ] as const;

    for (const code of codes) {
      const message = adPublishRejection(code);
      expect(message.title).not.toHaveLength(0);
      expect(message.reason).not.toHaveLength(0);
      expect(message.nextStep).not.toHaveLength(0);
    }
  });

  it('sends free duplicate attempts to packages instead of treating them as spam', () => {
    expect(adPublishRejection('free-duplicate')).toMatchObject({ actionHref: '/packages' });
  });
});

import { describe, expect, it } from 'vitest';
import { getTopupBannerThemeStyle, TOPUP_BANNER_EFFECTS, TOPUP_BANNER_HEIGHTS, TOPUP_BANNER_TEMPLATES, TOPUP_BANNER_WIDTHS, topupRewardLabel, normalizeTopupCampaignPresentation } from '@/lib/topup-campaign-presentation';

describe('top-up campaign presentation', () => {
  it('gives legacy campaigns the established Trbhh banner design', () => {
    expect(normalizeTopupCampaignPresentation()).toEqual({
      template: 'heritage',
      width: 'full',
      height: 'medium',
    });
  });

  it('keeps only known visual options', () => {
    expect(normalizeTopupCampaignPresentation({ template: 'navy-gold', width: 'card', height: 'tall' })).toEqual({
      template: 'navy-gold',
      width: 'card',
      height: 'tall',
    });
    expect(normalizeTopupCampaignPresentation({ template: 'url(javascript:alert(1))', width: '100vw', height: '999px' })).toEqual({
      template: 'heritage',
      width: 'full',
      height: 'medium',
    });
  });

  it('keeps a broad but bounded catalogue for administrators', () => {
    expect(TOPUP_BANNER_TEMPLATES).toHaveLength(11);
    expect(TOPUP_BANNER_WIDTHS).toHaveLength(3);
    expect(TOPUP_BANNER_HEIGHTS).toHaveLength(3);
  });

  it('uses measurable banner dimensions and rejects arbitrary sizing', () => {
    expect(normalizeTopupCampaignPresentation({ width: 'card', height: 'tall' })).toMatchObject({ width: 'card', height: 'tall' });
    expect(normalizeTopupCampaignPresentation({ width: '100vw', height: '9999px' })).toMatchObject({ width: 'full', height: 'medium' });
  });

  it('ships visible decorative effects without storing arbitrary animation code', () => {
    expect(TOPUP_BANNER_EFFECTS).toEqual(['animated-gradient', 'sparkles', 'shimmer']);
  });

  it('gives every selected template a distinct, explicit gradient', () => {
    expect(getTopupBannerThemeStyle('heritage').backgroundImage).not.toEqual(getTopupBannerThemeStyle('night-blue').backgroundImage);
  });

  it('labels the top-up amount and bonus together without ambiguity', () => {
    expect(topupRewardLabel(100, 10)).toBe('اشحن 100 ريال — مكافأة الشحن +10 ريال');
  });
});

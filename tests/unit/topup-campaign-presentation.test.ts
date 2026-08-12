import { describe, expect, it } from 'vitest';
import { TOPUP_BANNER_LAYOUTS, TOPUP_BANNER_SIZES, TOPUP_BANNER_TEMPLATES, normalizeTopupCampaignPresentation } from '@/lib/topup-campaign-presentation';

describe('top-up campaign presentation', () => {
  it('gives legacy campaigns the established Trbhh banner design', () => {
    expect(normalizeTopupCampaignPresentation()).toEqual({
      template: 'heritage',
      layout: 'ribbon',
      size: 'standard',
    });
  });

  it('keeps only known visual options', () => {
    expect(normalizeTopupCampaignPresentation({ template: 'navy-gold', layout: 'cards', size: 'large' })).toEqual({
      template: 'navy-gold',
      layout: 'cards',
      size: 'large',
    });
    expect(normalizeTopupCampaignPresentation({ template: 'url(javascript:alert(1))', layout: 'free-css', size: '999px' })).toEqual({
      template: 'heritage',
      layout: 'ribbon',
      size: 'standard',
    });
  });

  it('keeps a broad but bounded catalogue for administrators', () => {
    expect(TOPUP_BANNER_TEMPLATES).toHaveLength(8);
    expect(TOPUP_BANNER_LAYOUTS).toHaveLength(4);
    expect(TOPUP_BANNER_SIZES).toHaveLength(3);
  });
});

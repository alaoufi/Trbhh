import { describe, expect, it } from 'vitest';
import { analyseDynamicAd, analysisFingerprint } from '@/lib/dynamic-ads/analyser';

describe('dynamic advertisement analyser', () => {
  it('detects a vehicle and extracts year and mileage from Arabic shorthand', () => {
    const result = analyseDynamicAd({ title: 'جيب لكزس 2020 فل كامل ممشى 80', description: '' });
    expect(result.entityKey).toBe('vehicle');
    expect(result.extracted.year).toBe(2020);
    expect(result.extracted.mileage).toBe(80000);
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it('distinguishes property and livestock patterns', () => {
    expect(analyseDynamicAd({ title: 'شقة للإيجار مساحة 160 متر 4 غرف', description: '' }).entityKey).toBe('property');
    expect(analyseDynamicAd({ title: 'حري فحل أصيل', description: '' }).entityKey).toBe('livestock');
  });

  it('uses a stable content fingerprint to allow caching identical input', () => {
    const input = { title: 'سيارة 2020', description: 'ممشى 80 ألف' };
    expect(analysisFingerprint(input)).toBe(analysisFingerprint({ ...input }));
  });
});

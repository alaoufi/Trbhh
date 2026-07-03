import { describe, it, expect } from 'vitest';
import {
  storeTier, cleanFields, isCatalogStyle, bannerBackground, isLightColor,
  layoutTokens, STORE_TEMPLATES, STORE_LAYOUTS, CATALOG_STYLES, DEFAULT_CATALOG_FIELDS,
} from '@/lib/store-style';

describe('storeTier — مستوى المتجر من المتابعين والتقييم', () => {
  it('ذهبي: ٥٠+ متابع وتقييم ٤.٥+ من ٥+ تقييمات', () => {
    expect(storeTier(50, 4.5, 5).key).toBe('gold');
  });
  it('حدود الذهبي صارمة — أي نقص يهبط لفضي', () => {
    expect(storeTier(49, 4.5, 5).key).toBe('silver');
    expect(storeTier(50, 4.4, 5).key).toBe('silver');
    expect(storeTier(50, 4.5, 4).key).toBe('silver');
  });
  it('فضي عبر ١٠ تقييمات وحدها', () => {
    expect(storeTier(0, 0, 10).key).toBe('silver');
  });
  it('نشِط: ٣ متابعين أو تقييم واحد', () => {
    expect(storeTier(3, 0, 0).key).toBe('active');
    expect(storeTier(0, 5, 1).key).toBe('active');
  });
  it('جديد: لا شيء بعد', () => {
    expect(storeTier(0, 0, 0).key).toBe('new');
    expect(storeTier(2, 0, 0).key).toBe('new');
  });
});

describe('cleanFields — حقول الكتالوج المسموحة فقط', () => {
  it('يسقط الحقول المجهولة ويزيل التكرار', () => {
    expect(cleanFields('price,city,bogus,price')).toBe('price,city');
  });
  it('قائمة فارغة تبقى فارغة (المستدعي يطبّق الافتراضي)', () => {
    expect(cleanFields('')).toBe('');
  });
  it('الافتراضي نفسه صالح بالكامل', () => {
    expect(cleanFields(DEFAULT_CATALOG_FIELDS)).toBe(DEFAULT_CATALOG_FIELDS);
  });
});

describe('أنماط الكتالوج والقوالب والتيمات', () => {
  it('isCatalogStyle يقبل الأنماط الأربعة فقط', () => {
    for (const s of CATALOG_STYLES) expect(isCatalogStyle(s.id)).toBe(true);
    expect(isCatalogStyle('nope')).toBe(false);
    expect(isCatalogStyle(null)).toBe(false);
  });
  it('المكتبة: ٢٠ تيماً و٦ قوالب تخطيط', () => {
    expect(STORE_TEMPLATES.length).toBe(20);
    expect(STORE_LAYOUTS.length).toBe(6);
  });
  it('layoutTokens: فاخر متمركز، والافتراضي كلاسيكي', () => {
    expect(layoutTokens('luxury').align).toBe('center');
    expect(layoutTokens(null).hero).toBe(layoutTokens('classic').hero);
  });
});

describe('bannerBackground / isLightColor', () => {
  it('solid يعيد اللون نفسه، واللون غير الصالح يسقط للافتراضي', () => {
    expect(bannerBackground('solid', '#112233')).toBe('#112233');
    expect(bannerBackground('solid', 'red')).toBe('#3287da');
  });
  it('نمط مجهول يسقط لتدرّج يحوي اللون', () => {
    expect(bannerBackground('unknown', '#112233')).toContain('#112233');
  });
  it('isLightColor: أبيض فاتح وأسود داكن', () => {
    expect(isLightColor('#ffffff')).toBe(true);
    expect(isLightColor('#000000')).toBe(false);
  });
});

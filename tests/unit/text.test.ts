import { describe, it, expect } from 'vitest';
import { normalizeAr, similarity, isKeywordStuffing } from '@/domain/text';

describe('normalizeAr — تطبيع النص العربي لكشف التكرار', () => {
  it('يوحّد أشكال الألف', () => {
    expect(normalizeAr('أحمد')).toBe(normalizeAr('احمد'));
    expect(normalizeAr('إبراهيم')).toBe(normalizeAr('ابراهيم'));
    expect(normalizeAr('آلة')).toBe(normalizeAr('اله'));
  });

  it('يوحّد التاء المربوطة والألف المقصورة', () => {
    expect(normalizeAr('مدرسة')).toBe('مدرسه');
    expect(normalizeAr('هدى')).toBe('هدي');
  });

  it('يحذف التشكيل والرموز ويطوي المسافات', () => {
    expect(normalizeAr('مُحَمَّد')).toBe('محمد');
    expect(normalizeAr('سيارة!!! للبيع؟؟')).toBe('سياره للبيع');
    expect(normalizeAr('  نص   متباعد  ')).toBe('نص متباعد');
  });
});

describe('similarity — تشابه جاكارد', () => {
  it('نص متطابق = 1، نص متباين = 0', () => {
    expect(similarity('سياره للبيع', 'سياره للبيع')).toBe(1);
    expect(similarity('سياره للبيع', 'عقار للايجار')).toBe(0);
    expect(similarity('', 'اي شيء')).toBe(0);
  });

  it('تشابه جزئي محسوب بدقة (تقاطع/اتحاد)', () => {
    // {a b c} ∩ {a b d} = 2 ، الاتحاد = 4 → 0.5
    expect(similarity('واحد اثنان ثلاثه', 'واحد اثنان اربعه')).toBe(0.5);
  });
});

describe('isKeywordStuffing — كشف حشو الكلمات', () => {
  it('نص إعلاني طبيعي → ليس حشواً', () => {
    expect(isKeywordStuffing('سيارة تويوتا كامري', 'موديل حديث للبيع بحالة ممتازة نظيفة جداً وفحص كامل')).toBe(false);
  });

  it('نص قصير لا يُحكم عليه', () => {
    expect(isKeywordStuffing('تأجير تأجير', 'تأجير تأجير')).toBe(false);
  });

  it('كلمة واحدة مهيمنة (٦+ مرات ونسبة عالية) → حشو', () => {
    expect(isKeywordStuffing('تأجير تأجير تأجير', 'تأجير تأجير تأجير رافعات معدات')).toBe(true);
  });

  it('عبارة ثنائية مكررة ٤ مرات → حشو', () => {
    expect(isKeywordStuffing('رافعة شوكية رافعة شوكية', 'رافعة شوكية رافعة شوكية')).toBe(true);
  });
});

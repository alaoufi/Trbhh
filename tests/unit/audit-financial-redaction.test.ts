import { describe, expect, it } from 'vitest';
import { isFinancialAudit } from '@/lib/audit';

describe('audit log — financial-detail classifier for redaction', () => {
  it('flags rows whose note carries an amount or wallet detail', () => {
    expect(isFinancialAudit('تأكيد شحن رصيد', '500 ر.س للعضو #5', 'طلب #12')).toBe(true);
    expect(isFinancialAudit('خصم رصيد', '200 ر.س — تسوية', 'العضو #5')).toBe(true);
    expect(isFinancialAudit('إلغاء توثيق مدفوع', 'سبب — استرداد 90 ر.س', 'العضو #5')).toBe(true);
    expect(isFinancialAudit('إضافة مصروف', '1200 ر.س', 'إيجار')).toBe(true);
    expect(isFinancialAudit('بدء شحن خاص بالراجحي', '300 ر.س', 'طلب #9')).toBe(true);
    expect(isFinancialAudit('إضافة رصيد', '50 ريال', 'العضو #1')).toBe(true);
  });

  it('does not flag ordinary moderation actions with no financial detail', () => {
    expect(isFinancialAudit('حذف إعلان', 'مخالفة', 'الإعلان #7')).toBe(false);
    expect(isFinancialAudit('حظر عضو', 'تكرار', 'العضو #5')).toBe(false);
    expect(isFinancialAudit('اعتماد متجر', null, 'متجر #3')).toBe(false);
    expect(isFinancialAudit('إخفاء إعلان متجر عن النشر + إنذار مخالفة', 'صورة مخالفة', 'متجر #3')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { canAccessPage, pagePermission } from '@/lib/access-control/catalog';
import { redactAdminLogRows, REDACTED_FINANCIAL_NOTE, type AdminLogRow } from '@/lib/audit';

/**
 * محاكاة «حساب اختبار مؤقت» بصلاحية audit:view فقط (بلا finance:view ولا
 * reconciliation:view ولا access_control). نُنشئ مجموعة منحه، نتحقق من القرارات
 * الخادمية الفعلية (نفس ما تستخدمه صفحات الإدارة: canAccessPage للوصول، وحجب
 * المبالغ المالية)، ثم «نحذفه» بإفراغ منحه — كل ذلك دون إنشاء حساب دائم على الإنتاج.
 */
// نفس منطق صفحة /admin/audit: المبالغ تظهر فقط لمن يملك صلاحية مالية أو تدقيق مالي.
const canSeeFinancial = (keys: ReadonlySet<string>) => keys.has('finance:view') || keys.has('reconciliation:view');

const financialRow: AdminLogRow = { id: 1, adminId: 9, adminName: 'محاسب', action: 'تأكيد شحن رصيد', target: 'طلب #12', note: '500 ر.س للعضو #5', at: null };
const neutralRow: AdminLogRow = { id: 2, adminId: 9, adminName: 'مشرف', action: 'حذف إعلان', target: 'الإعلان #7', note: 'مخالفة', at: null };

describe('temporary audit-only role — server-side access + financial redaction', () => {
  const auditOnly = new Set(['audit:view']); // الحساب المؤقت: تدقيق فقط

  it('opens /admin/audit but denies /admin/finance and /admin/access-control', () => {
    expect(canAccessPage(auditOnly, '/admin/audit')).toBe(true);
    expect(canAccessPage(auditOnly, '/admin/finance')).toBe(false);
    expect(canAccessPage(auditOnly, '/admin/finance?section=invoices')).toBe(false);
    expect(canAccessPage(auditOnly, '/admin/finance/invoices/1')).toBe(false);
    expect(canAccessPage(auditOnly, '/admin/access-control')).toBe(false);
    expect(canAccessPage(auditOnly, '/admin/roles')).toBe(false); // access_control:view
    // البوابة تتطلب فعلاً صلاحية مالية/وصول لهذه الصفحات:
    expect(pagePermission('/admin/finance')).toBe('finance:view');
    expect(pagePermission('/admin/access-control')).toBe('access_control:view');
    expect(pagePermission('/admin/audit')).toBe('audit:view');
  });

  it('redacts financial amounts in the audit log for the audit-only account', () => {
    expect(canSeeFinancial(auditOnly)).toBe(false);
    const rows = redactAdminLogRows([financialRow, neutralRow], !canSeeFinancial(auditOnly));
    // المبلغ محجوب في السطر المالي، مع بقاء الفعل والهدف للمساءلة
    expect(rows[0].note).toBe(REDACTED_FINANCIAL_NOTE);
    expect(rows[0].note).not.toContain('500');
    expect(rows[0].action).toBe('تأكيد شحن رصيد');
    expect(rows[0].target).toBe('طلب #12');
    // السطر غير المالي يظهر كما هو
    expect(rows[1].note).toBe('مخالفة');
  });

  it('a finance-capable account still sees amounts (proves gate is precise, not blanket)', () => {
    const financeRole = new Set(['audit:view', 'finance:view']);
    expect(canSeeFinancial(financeRole)).toBe(true);
    const rows = redactAdminLogRows([financialRow, neutralRow], !canSeeFinancial(financeRole));
    expect(rows[0].note).toBe('500 ر.س للعضو #5'); // غير محجوب
  });

  it('after removing the temporary grants the account loses audit access too', () => {
    const removed = new Set<string>(); // «حذف» الحساب المؤقت = إفراغ منحه
    expect(canAccessPage(removed, '/admin/audit')).toBe(false);
    expect(canAccessPage(removed, '/admin/finance')).toBe(false);
    expect(canAccessPage(removed, '/admin/access-control')).toBe(false);
  });
});

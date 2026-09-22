import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getFinancePermissions, requireFinance } from '@/lib/finance/permissions';
import { readFinanceData } from '@/lib/finance/read-model';
import { buildFinanceReport, parseFinanceQuery } from '@/lib/finance/reports';
import { FinanceWorkspace } from '@/components/finance/finance-workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'المتابعة المالية | تربح' };

const errorMessages: Record<string, string> = {
  finance_amount_invalid: 'اكتب المبلغ بالريال باستخدام منزلتين عشريتين كحد أقصى، دون فواصل آلاف أو قيمة سالبة.',
  finance_date_invalid: 'راجع تاريخ المصروف والاستحقاق. يجب أن يقع المصروف في الشهر المختار وألا يكون في المستقبل.',
  finance_current_period_required: 'هذا الإجراء يسجل في الشهر الحالي فقط. اختر الشهر الحالي ثم أعد المراجعة.',
  finance_period_closed: 'الشهر مقفل ولا يقبل تعديلًا بأثر رجعي. سجّل التصحيح في فترة مفتوحة وفق السياسة.',
  finance_month_not_ended: 'لا يمكن إقفال الشهر قبل انتهائه.',
  finance_checklist_incomplete: 'أكمل خطوات المراجعة السبع قبل اعتماد إقفال الشهر.',
  finance_close_blocked: 'لم يُقفل الشهر؛ بقيت مصادر ناقصة أو فروقات مانعة. افتح المطابقة لمعرفة البنود المطلوبة.',
  finance_selection_invalid: 'اختر استحقاقًا صالحًا واحدًا على الأقل من قائمة المورد قبل تجهيز التسوية.',
  finance_accrual_not_due: 'أحد المبالغ المختارة لم يستوفِ شروط الاستحقاق أو لم يحن موعده. راجع كشف المورد.',
  finance_already_settled: 'أُدرج أحد المبالغ في تسوية أخرى. حدّث كشف المورد قبل إنشاء مسودة جديدة.',
  finance_confirmation_required: 'راجع معاينة التسوية وأكّد أن التحويل تم خارج النظام قبل توثيقه.',
  finance_settlement_difference: 'يوجد فرق في قيمة التسوية. لم تُعتمد؛ راجع بنودها ومصادرها.',
  finance_settlement_state: 'تغيرت حالة التسوية ولم يعد هذا الإجراء متاحًا. راجع السجل المحدث.',
  finance_reversal_invalid: 'لا يمكن عكس هذا السجل؛ قد يكون عُكس سابقًا أو ليس سجلًا أصليًا صالحًا.',
  finance_idempotency_conflict: 'استُخدم مرجع الحفظ لبيانات مختلفة. حدّث الصفحة وراجع المدخلات قبل المحاولة.',
  finance_issuance_not_approved: 'سياسة الإصدار لم تُعتمد بعد؛ سيبقى المستند سجلًا معلقًا.',
  finance_invoice_difference: 'لم يُحفظ المستند لوجود فرق في مبالغه. راجع المطابقة ومصدر الطلب.',
  finance_invoice_immutable: 'المستند الصادر ثابت؛ التصحيح يحتاج مستندًا مستقلًا مرتبطًا بالأصل.',
};

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = parseFinanceQuery(Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])));
  const session = await requireFinance(query.section);
  const [permissions, data] = await Promise.all([getFinancePermissions(session.uid,query.section), readFinanceData(prisma)]);
  const report = buildFinanceReport(data, query, new Date());
  const error = typeof params.error === 'string' ? params.error : null;
  return <div className="space-y-3">
    {params.saved && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">تم حفظ الإجراء. عُرض التقرير من السجلات المحدثة.</p>}
    {error && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{errorMessages[error] || 'تعذر تنفيذ الإجراء. راجع الحقول المطلوبة والفترة وصلاحيتك وجاهزية المصادر، ثم أعد المحاولة.'}</p>}
    <FinanceWorkspace report={report} canEdit={permissions.edit} canApprove={permissions.approve} canClose={permissions.close} canExport={permissions.export} canRefund={permissions.refund} visibleSections={permissions.visibleSections} viewFinance={permissions.viewFinance} viewSettlements={permissions.viewSettlements} viewReconciliation={permissions.viewReconciliation} actionKey={randomUUID()} />
  </div>;
}

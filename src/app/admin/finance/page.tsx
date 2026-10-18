import {WalletReviewQueue} from '@/components/finance/wallet-review-queue';
import {readWalletReviewQueue} from '@/lib/finance/wallet-review';
import {readTaxDraft} from '@/lib/finance/tax-draft';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { financePermissionsFromKeys, requireFinance } from '@/lib/finance/permissions';
import { readActorAccess } from '@/lib/access-control/guards';
import { redactFinanceAudit } from '@/lib/finance/audit-visibility';
import { readFinanceData } from '@/lib/finance/read-model';
import { buildFinanceReport, parseFinanceQuery } from '@/lib/finance/reports';
import { FinanceWorkspace } from '@/components/finance/finance-workspace';
import {TaxRegistrationMonitor} from '@/components/finance/tax-registration-monitor';
import {readTaxRegistrationMonitor} from '@/lib/finance/tax-registration-read';
import {allowedTaxGapReviewHrefs} from '@/lib/finance/tax-registration-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'المتابعة المالية | تربح' };

const errorMessages: Record<string, string> = {
  finance_return_rounding_review: 'تحتاج تجزئة هذا المرتجع إلى مراجعة فروق التقريب حتى الهللة. لم يُحفظ الطلب؛ يمكن إرجاع البند كاملًا أو مراجعة المحاسب.',
  finance_independent_checker_required: 'يتطلب هذا الطلب مراجعًا مستقلًا بصلاحية الاعتماد.',
  finance_change_missing: 'طلب المراجعة غير موجود أو لا يطابق القسم المحدد.',
  finance_change_state: 'تغيرت حالة الطلب. حدّث الصفحة لمراجعة القرار المسجل.',
  finance_return_changed: 'تغيرت المستندات أو المرتجعات المرتبطة. ألغِ الطلب وراجع طلبًا جديدًا بالقيم الحالية.',
  finance_note_exceeds_original: 'كمية المرتجع تتجاوز الكمية المتبقية في المستند الأصلي.',
  finance_period_version_conflict: 'تغيرت نسخة الفترة منذ إنشاء الطلب. راجع حالة الإقفال قبل طلب جديد.',
  finance_tax_policy_invalid: 'راجع جهة الإصدار ومرجع السياسة وحد التسجيل. يبدأ السريان اليوم بعد الاعتماد أو في تاريخ لاحق؛ تفعيل الضريبة يتطلب تسجيلًا ضريبيًا ساريًا.',
  finance_reason_required: 'اكتب سببًا واضحًا ومرجع المراجعة قبل حفظ الإجراء.',
  finance_reconciliation_unresolved: 'لا يمكن توثيق المراجعة مع وجود فروقات مانعة. راجع مصادر المطابقة أولًا.',
  finance_request_missing: 'طلب المراجعة غير موجود. حدّث السجلات قبل المحاولة.',
  finance_maker_checker: 'لا يمكن لمنشئ الطلب اعتماده. يلزم مراجع آخر بصلاحية الاعتماد.',
  finance_request_state: 'تغيرت حالة الطلب. حدّث الصفحة للاطلاع على القرار المسجل.',
  finance_quantity_invalid: 'راجع كميات المرتجع؛ يجب أن تكون صحيحة ومتاحة في الفاتورة الأصلية.',
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
  finance_wallet_review_failed: 'تعذر توثيق القرار. حدّث القائمة وراجع تغير المصدر أو القرار السابق وتكرار بند المستند وتداخل الفواتير؛ لم يُحفظ اعتماد جديد.',
  finance_wallet_review_confirmation: 'يلزم تأكيد صريح بعد مراجعة مستند الخدمة والتصنيف والصافي.',
  finance_wallet_review_invalid: 'راجع هوية المصدر والقرار والمراجع والملاحظات المطلوبة.',
  finance_invoice_immutable: 'المستند الصادر ثابت؛ التصحيح يحتاج مستندًا مستقلًا مرتبطًا بالأصل.',
};

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = parseFinanceQuery(Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])));
  const session = await requireFinance(query.section);
  const [access, data] = await Promise.all([readActorAccess(session.uid), readFinanceData(prisma)]);
  const permissions = financePermissionsFromKeys(access.keys, query.section);
  const taxDraft=query.section==='tax'&&permissions.manageTax?await readTaxDraft(BigInt(session.uid)):null;
  const now=new Date();
  const report = buildFinanceReport(redactFinanceAudit(data, access.keys), query, now);
  const taxMonitor=access.keys.has('tax:view')&&['overview','tax'].includes(query.section)
    ? await readTaxRegistrationMonitor(prisma,BigInt(session.uid),now):null;
  let walletQueue:Awaited<ReturnType<typeof readWalletReviewQueue>>|null=null;let walletQueueError=false;
  const showWalletQueue=query.section==='tax'&&access.keys.has('tax:view')&&access.keys.has('wallets:view');
  if(showWalletQueue){
    const rawPage=typeof params.walletPage==='string'?params.walletPage:'1';
    try{walletQueue=await readWalletReviewQueue(prisma,BigInt(session.uid),{page:/^\d{1,8}$/.test(rawPage)?Number(rawPage):1});}catch{walletQueueError=true;}
  }
  const error = typeof params.error === 'string' ? params.error : null;
  return <div className="space-y-3">
    {params.walletReviewSaved&&<p role="status">تم توثيق قرار المراجع. طلب المستند يبقى مفتوحًا؛ لا يُعتمد إلا الدليل الصريح المطابق للمصدر الحالي.</p>}
    {params.draft&&<p role="status" className="rounded-xl border p-3">تم حفظ المسودة. يمكنك إكمالها لاحقًا؛ لم تتغير إعدادات الفواتير المعتمدة.</p>}
    {params.settingsStored&&<p role="status" className="rounded-xl border p-3">تم حفظ البيانات. لإتاحة الشراء أكمل اسم الجهة وعنوانها ومسؤول إصدار مخول وتاريخ سريان صالح؛ لم تتغير سياسة الفواتير السابقة.</p>}
    {params.settingsApplied&&<p role="status" className="rounded-xl border p-3">تم حفظ الإعدادات وتطبيقها بدءًا من تاريخ السريان المحدد. تُستخدم تلقائيًا للفواتير الجديدة ولا تحتاج إدخالها لكل فاتورة.</p>}
    {params.saved&&!params.walletReviewSaved&&!params.draft&&!params.settingsStored&&!params.settingsApplied && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{params.submitted?'تم إرسال الطلب للمراجعة؛ لم يُعتمد بعد. راجع قسم طلبات المراجعة والاعتماد أدناه.':'تم حفظ الإجراء. عُرض التقرير من السجلات المحدثة.'}</p>}
    {error && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{errorMessages[error] || 'تعذر تنفيذ الإجراء. راجع الحقول المطلوبة والفترة وصلاحيتك وجاهزية المصادر، ثم أعد المحاولة.'}</p>}
    {taxMonitor&&<TaxRegistrationMonitor report={taxMonitor} allowedReviewHrefs={allowedTaxGapReviewHrefs(taxMonitor.coverage.gaps.map(gap=>gap.code),access.keys)}/>}
    {showWalletQueue&&<WalletReviewQueue queue={walletQueue} error={walletQueueError} canApprove={access.keys.has('tax:approve')} month={query.month} actionKey={randomUUID()}/>}
    <FinanceWorkspace taxDraft={taxDraft} report={report} canEdit={permissions.edit} canApprove={permissions.approve} canClose={permissions.close} canExport={permissions.export} canRefund={permissions.refund} canCancel={permissions.cancel} canReconcile={permissions.reconcile} canManageTax={permissions.manageTax} canReopen={permissions.reopen} currentUserId={String(session.uid)} visibleSections={permissions.visibleSections} viewFinance={permissions.viewFinance} viewSettlements={permissions.viewSettlements} viewReconciliation={permissions.viewReconciliation} actionKey={randomUUID()} />
  </div>;
}

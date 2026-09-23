import { createHash } from 'node:crypto';
import Link from 'next/link';
import type { FinanceChangeRequest, FinanceReopenPayload, FinanceReport, FinanceReturnPayload, FinanceTaxPayload } from '@/lib/finance/types';
import { financeChangeMatches, financeMatchesText, formatFinanceRecordDate } from '@/lib/finance/filters';
import { formatFinanceMoney } from '@/lib/finance/reports';
import { approveFinanceRequest, cancelFinanceRequest, requestFinancePeriodReopen, requestFinanceReturn, requestFinanceReturnReversal, requestFinanceTaxSettings } from '@/app/admin/finance/actions';
import { FinanceSubmitButton } from './finance-controls';
import styles from './finance.module.css';

type Props={report:FinanceReport;actionKey:string;currentUserId?:string;canCreate?:boolean;canApprove?:boolean;canCancel?:boolean;canManageTax?:boolean;canReopen?:boolean};
const labels={return:'طلب مرتجع',tax_settings:'تغيير إعدادات الضريبة',reopen_period:'إعادة فتح فترة'};
const statuses={pending:'بانتظار مراجع مستقل',approved:'معتمد',cancelled:'ملغى'};
function Fields({props,purpose}:{props:Props;purpose:string}) {
  const hash=createHash('sha256').update(`${props.actionKey}:${purpose}`).digest('hex');
  const key=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  return <><input type="hidden" name="requestKey" value={key}/><input type="hidden" name="month" value={props.report.query.month}/><input type="hidden" name="returnTo" value={props.report.query.section}/></>;
}
function Reason({label='السبب ومرجع المستند'}:{label?:string}) {return <label className={styles.field}>{label}<textarea name="reason" className={styles.textarea} required minLength={3} maxLength={1000}/></label>;}
function Panel({title,children}:{title:string;children:React.ReactNode}) {return <section className={`${styles.panel} ${styles.panelPad}`}><h2 className={styles.sectionTitle}>{title}</h2><div className={styles.stack} style={{marginTop:16}}>{children}</div></section>;}
const priceBasisLabels={inclusive:'شامل الضريبة',exclusive:'غير شامل الضريبة'};
function CalculationDetails({payload}:{payload:FinanceTaxPayload}) {
  const policy=payload.calculationPolicy;
  if(!policy)return <p className={styles.notice}>لم تُحدد سياسة حساب للإصدار المستقبلي في هذا السجل السابق. لا يُستخدم وحده لإصدار فواتير الطلبات الجديدة.</p>;
  return <dl className={styles.formGrid}>
    <div><dt className={styles.muted}>أساس أسعار المنتجات</dt><dd>{priceBasisLabels[policy.priceBasis]}</dd></div>
    <div><dt className={styles.muted}>نطاق الضريبة</dt><dd>نسبة موحدة على جميع منتجات الكتالوج</dd></div>
    <div><dt className={styles.muted}>أساس سعر الشحن</dt><dd>{priceBasisLabels[policy.shippingPriceBasis]}</dd></div>
    <div><dt className={styles.muted}>ضريبة الشحن</dt><dd>{policy.shippingVatBps/100}%</dd></div>
    <div><dt className={styles.muted}>معالجة الخصم</dt><dd>{policy.discountTreatment==='none'?'لا توجد خصومات':'قبل احتساب الضريبة'}</dd></div>
    <div><dt className={styles.muted}>التقريب</dt><dd>تقريب كل بند إلى أقرب هللة؛ النصف للأعلى</dd></div>
    <div><dt className={styles.muted}>تغير السياسة بعد إنشاء الطلب</dt><dd>إيقاف الإصدار للمراجعة عند تغير السياسة</dd></div>
    <div><dt className={styles.muted}>مسؤول الإصدار الآلي</dt><dd>الموظف المفوض #{policy.automationDelegateId}</dd></div>
  </dl>;
}
function PolicySelect({name,label,options}:{name:string;label:string;options:readonly (readonly [string,string])[]}) {
  return <label className={styles.field}>{label}<select name={name} className={styles.input} required defaultValue=""><option value="" disabled>اختر بعد المراجعة</option>{options.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>;
}
function TaxPolicyFields() {
  const priceOptions=[['inclusive',priceBasisLabels.inclusive],['exclusive',priceBasisLabels.exclusive]] as const;
  return <div className={styles.formGrid}>
    <label className={styles.field}>اسم جهة الإصدار<input name="issuerName" className={styles.input} maxLength={200} required/></label>
    <label className={styles.field}>الرقم الضريبي<input name="issuerTaxNumber" className={styles.input} inputMode="numeric" pattern="3[0-9]{13}3" maxLength={15} required/></label>
    <label className={styles.field}>عنوان جهة الإصدار<input name="issuerAddress" className={styles.input} maxLength={500} required/></label>
    <label className={styles.field}>ضريبة المنتجات (%)<input name="vatPercent" type="number" min="0" max="100" step="0.01" className={styles.input} required/></label>
    <PolicySelect name="priceBasis" label="أساس أسعار المنتجات" options={priceOptions}/>
    <PolicySelect name="itemScope" label="نطاق ضريبة المنتجات" options={[["uniform_catalog","نسبة موحدة على جميع منتجات الكتالوج"]]}/>
    <PolicySelect name="shippingPriceBasis" label="أساس سعر الشحن" options={priceOptions}/>
    <label className={styles.field}>ضريبة الشحن (%)<input name="shippingVatPercent" type="number" min="0" max="100" step="0.01" className={styles.input} required/></label>
    <PolicySelect name="discountTreatment" label="معالجة الخصم" options={[["none","لا توجد خصومات"],["before_tax","قبل احتساب الضريبة"]]}/>
    <PolicySelect name="rounding" label="طريقة التقريب" options={[["line_half_up","تقريب كل بند إلى أقرب هللة؛ النصف للأعلى"]]}/>
    <PolicySelect name="policyRollover" label="تغير السياسة بعد إنشاء الطلب" options={[["hold_for_review","إيقاف الإصدار للمراجعة عند تغير السياسة"]]}/>
    <label className={styles.field}>معرف الموظف المفوض بالإصدار الآلي<input name="automationDelegateId" className={styles.input} inputMode="numeric" pattern="[1-9][0-9]*" maxLength={20} required/><span className={styles.muted}>أدخل بيانات حساب موظف موجود ومخول بالإصدار؛ يعيد الخادم فحص صلاحياته عند الاعتماد والإصدار.</span></label>
    <label className={styles.field}>تاريخ بدء السريان<input name="effectiveFrom" type="date" className={styles.input} required/></label>
    <label className={styles.field}>مرجع السياسة المعتمدة<input name="policyReference" className={styles.input} maxLength={160} required/></label>
  </div>;
}
function RequestDetails({request,report}:{request:FinanceChangeRequest;report:FinanceReport}) {
  if(request.kind==='return') {
    const invoice=report.data.invoices.find(row=>row.id===request.targetId);
    const payload=request.payload as FinanceReturnPayload;
    const credit=payload.reversalOf?report.data.invoices.find(row=>row.id===payload.reversalOf):null;
    return <><p className={styles.muted}>المستند الأصلي: <Link className={styles.textLink} href={`/admin/finance/invoices/${encodeURIComponent(request.targetId)}`}>{invoice?.number||`#${request.targetId}`}</Link></p>
      {payload.reversalOf?<p>عكس الإشعار الدائن بالكامل: <Link className={styles.textLink} href={`/admin/finance/invoices/${encodeURIComponent(payload.reversalOf)}`}>{credit?.number||`#${payload.reversalOf}`}</Link></p>:<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>البند المحفوظ</th><th>الكمية المطلوبة</th></tr></thead><tbody>{payload.lines.map(line=><tr key={line.key}><td>{invoice?.snapshot?.lines.find(item=>item.key===line.key)?.title||line.key}</td><td>{line.quantity}</td></tr>)}</tbody></table></div>}
      {request.result&&<div className={styles.formGrid}><p>قيمة الإشعار: <strong>{request.result.totalMinor===undefined?'غير مكتمل':formatFinanceMoney(request.result.totalMinor)}</strong></p><p>الضريبة المحسوبة من الأصل: <strong>{request.result.vatMinor===undefined?'غير مكتمل':formatFinanceMoney(request.result.vatMinor)}</strong></p></div>}
      {request.result?.number&&<p className={styles.success}>{payload.reversalOf?'الإشعار المدين':'الإشعار الدائن'}: {request.result.number}</p>}
      <p className={styles.muted}>{payload.reversalOf?'يصدر الاعتماد إشعارًا مدينًا مرتبطًا بالإشعار الدائن دون تحصيل مبلغ جديد. يعيد الخادم فحص الأصل وأي رد مالي مسجل قبل الاعتماد.':'اعتماد الإشعار لا ينفذ رد المال. يُوثّق الرد النقدي بصورة مستقلة عند وصول الدليل من المصدر المعتمد.'}</p></>;
  }
  if(request.kind==='tax_settings') {const payload=request.payload as FinanceTaxPayload;return <><dl className={styles.formGrid}><div><dt className={styles.muted}>جهة الإصدار</dt><dd>{payload.issuer.name}</dd></div><div><dt className={styles.muted}>الرقم الضريبي</dt><dd>{payload.issuer.taxNumber}</dd></div><div><dt className={styles.muted}>العنوان</dt><dd>{payload.issuer.address}</dd></div><div><dt className={styles.muted}>النسبة / بدء السريان</dt><dd>{payload.vatBps/100}% · {payload.effectiveFrom}</dd></div><div><dt className={styles.muted}>مرجع السياسة</dt><dd className={styles.break}>{payload.policyReference}</dd></div></dl><CalculationDetails payload={payload}/></>;}
  return <p>الفترة المطلوب فتحها: <strong>{request.targetId}</strong> · إصدار الفترة عند الطلب: {(request.payload as FinanceReopenPayload).expectedVersion}</p>;
}
function RequestList(props:Props) {
  const rows=(props.report.data.requests??[]).filter(row=>financeChangeMatches(row,props.report.query,props.report.data));
  return <Panel title="طلبات المراجعة والاعتماد">{rows.length?rows.map(request=>{
    const canCancel=request.kind==='return'?props.canCancel:request.kind==='tax_settings'?props.canManageTax:props.canReopen;
    const own=request.makerId===props.currentUserId;
    return <article key={request.id} className={styles.details}><div className={styles.sectionHeading}><h3 className={styles.sectionTitle}>{labels[request.kind]} #{request.id}</h3><span className={`${styles.badge} ${request.status==='approved'?styles.badgeGood:request.status==='pending'?styles.badgeWarning:''}`}>{statuses[request.status]}</span></div><p className={styles.muted}>المنشئ #{request.makerId} · {formatFinanceRecordDate(request.at)} · المراجع {request.checkerId?`#${request.checkerId}`:'لم يُعيّن بعد'}{request.decidedAt&&` · القرار ${formatFinanceRecordDate(request.decidedAt)}`}</p><p className={styles.small}>سبب الطلب: {request.reason}</p><RequestDetails request={request} report={props.report}/>{request.result?.mode&&<p className={styles.muted}>مسار الاعتماد: {request.result.mode==='sole_approver'?'المعتمد الوحيد بعد فحص الصلاحيات':'مراجع مستقل'}</p>}{request.approvalReason&&<p className={styles.small}>سبب القرار: {request.approvalReason}</p>}{request.status==='pending'&&own&&<p className={styles.notice}>أنشأت هذا الطلب. إذا وجد معتمد آخر سيُرفض الاعتماد الذاتي؛ يعيد النظام فحص المعتمدين عند الحفظ.</p>}{request.status==='pending'&&props.canApprove&&<form action={approveFinanceRequest} className={styles.form}><Fields props={props} purpose={`approve-request-${request.id}`}/><input type="hidden" name="changeId" value={request.id}/><input type="hidden" name="kind" value={request.kind}/>{own&&<label className={styles.checkbox}><input type="checkbox" required/><span>أقر بأن اعتماد طلبي يخضع لفحص وجود مراجع مستقل، ولا يتجاوز الصلاحيات.</span></label>}<Reason label="سبب الاعتماد ومرجع المراجعة"/><FinanceSubmitButton className={styles.button} disabled={!props.report.data.ready}>اعتماد الطلب بعد المراجعة</FinanceSubmitButton></form>}{request.status==='pending'&&canCancel&&<details className={styles.details}><summary>إلغاء الطلب مع الاحتفاظ بسجله</summary><form action={cancelFinanceRequest} className={styles.form}><Fields props={props} purpose={`cancel-request-${request.id}`}/><input type="hidden" name="changeId" value={request.id}/><input type="hidden" name="kind" value={request.kind}/><Reason label="سبب إلغاء الطلب"/><FinanceSubmitButton className={styles.dangerButton} disabled={!props.report.data.ready}>إلغاء الطلب</FinanceSubmitButton></form></details>}</article>;
  }):<p className={styles.muted}>لا توجد طلبات مطابقة للفترة والتصفية الحالية.</p>}</Panel>;
}
export function FinanceWorkflowPanel(props:Props) {
  const {report}=props;
  const period=report.data.periods.find(row=>row.month===report.query.month);
  const invoices=report.data.invoices.filter(row=>row.kind==='invoice'&&row.status==='issued'&&row.snapshot&&(!report.query.supplierId||row.source.suppliers.some(supplier=>supplier.supplierId===report.query.supplierId))&&financeMatchesText(report.query,row.id,row.number,row.source.customerName));
  const creditNotes=report.data.invoices.filter(row=>row.kind==='credit_note'&&row.status==='issued'&&row.snapshot&&row.parentId&&(!report.query.supplierId||row.source.suppliers.some(supplier=>supplier.supplierId===report.query.supplierId))&&financeMatchesText(report.query,row.id,row.number,row.source.customerName));
  return <div className={styles.stack} style={{marginTop:18}}>
    {report.query.section==='returns'&&<><div className={styles.notice}><p>اختيار كميات المرتجع يحسب قيمها من الفاتورة الأصلية. يراجعها شخص آخر قبل إصدار الإشعار الدائن؛ لا تنفذ هذه الشاشة أي استرداد بنكي.</p></div>{props.canCreate&&<Panel title="إنشاء طلب مرتجع">{invoices.length?invoices.map(invoice=><details key={invoice.id} className={styles.details}><summary>{invoice.number||`فاتورة #${invoice.id}`} · {invoice.source.customerName} · {formatFinanceRecordDate(invoice.at)}</summary><form action={requestFinanceReturn} className={styles.form}><Fields props={props} purpose={`return-${invoice.id}`}/><input type="hidden" name="invoiceId" value={invoice.id}/><p className={styles.muted}>اكتب الكميات المراد إرجاعها فقط. يتحقق الخادم من المرتجعات السابقة والكميات المتبقية قبل الحفظ.</p>{invoice.snapshot!.lines.map(line=><label key={line.key} className={styles.field}>{line.title} · الكمية الأصلية {line.quantity}<input type="hidden" name="lineKeys" value={line.key}/><input type="number" name={`quantity:${line.key}`} className={styles.input} min="0" max={line.quantity} step="1" defaultValue="0" required/></label>)}<Reason/><FinanceSubmitButton className={styles.button} disabled={!report.data.ready}>حفظ طلب المرتجع ومعاينته</FinanceSubmitButton></form></details>):<p className={styles.muted}>لا توجد فاتورة أصلية صادرة مطابقة. السجل الذي ينتظر السياسة لا يقبل إشعارًا ماليًا.</p>}</Panel>}</>}
    {report.query.section==='returns'&&props.canCreate&&creditNotes.length>0&&<Panel title="طلب عكس الإشعار الدائن بالكامل"><p className={styles.muted}>اختر الإشعار المطلوب عكسه. تُحسب قيم الإشعار المدين من المصدر المحفوظ ويُراجع الطلب قبل الاعتماد. لا ينفذ الطلب تحصيلًا أو استردادًا ماليًا.</p>{creditNotes.map(credit=><details key={credit.id} className={styles.details}><summary>{credit.number||`إشعار #${credit.id}`} · {credit.source.customerName} · {formatFinanceMoney(credit.totalMinor)}</summary><form action={requestFinanceReturnReversal} className={styles.form}><Fields props={props} purpose={`reverse-credit-${credit.id}`}/><input type="hidden" name="invoiceId" value={credit.parentId!}/><input type="hidden" name="creditNoteId" value={credit.id}/><p><Link className={styles.textLink} href={`/admin/finance/invoices/${encodeURIComponent(credit.id)}`}>مراجعة الإشعار الدائن الأصلي</Link></p><Reason label="سبب عكس الإشعار ومرجع التصحيح"/><FinanceSubmitButton className={styles.button} disabled={!report.data.ready}>إرسال طلب العكس للمراجعة</FinanceSubmitButton></form></details>)}</Panel>}
    {report.query.section==='tax'&&<>
      <Panel title="سياسات الضريبة المعتمدة">{(report.data.taxPolicies??[]).length?(report.data.taxPolicies??[]).map(row=><article key={row.id} className={styles.details}><strong>{row.issuer.name} · {row.vatBps/100}%</strong><p className={styles.muted}>بدء السريان {row.effectiveFrom} · الطلب #{row.requestId}</p><p className={styles.small}>{row.policyReference}</p><CalculationDetails payload={row}/></article>):<p className={styles.muted}>لم تُعتمد سياسة من مسار المراجعة. لا تُفترض جهة إصدار أو نسبة ضريبة.</p>}</Panel>
      {props.canManageTax&&<Panel title="طلب تغيير إعدادات الضريبة"><p className={styles.muted}>يُراجع الطلب قبل سريانه على المستندات الجديدة. تبقى المستندات الصادرة محفوظة دون إعادة حساب، واعتماد السياسة وحده ليس إثباتًا للامتثال الضريبي.</p><form action={requestFinanceTaxSettings} className={styles.form}><Fields props={props} purpose="tax-settings"/><TaxPolicyFields/><Reason/><FinanceSubmitButton className={styles.button} disabled={!report.data.ready}>إرسال إعدادات الضريبة للمراجعة</FinanceSubmitButton></form></Panel>}
    </>}
    {report.query.section==='close'&&props.canReopen&&period?.closedAt&&<Panel title="طلب إعادة فتح الفترة"><p className={styles.muted}>إعادة الفتح تتطلب سببًا ومراجعًا آخر. يُحتفظ بالإقفال السابق في التدقيق وتُراجع نسخة الفترة مجددًا عند الاعتماد.</p><form action={requestFinancePeriodReopen} className={styles.form}><Fields props={props} purpose={`reopen-${period.month}-${period.version??0}`}/><input type="hidden" name="expectedVersion" value={period.version??0}/><Reason/><FinanceSubmitButton className={styles.button} disabled={!report.data.ready}>إرسال طلب إعادة فتح {period.month}</FinanceSubmitButton></form></Panel>}
    <RequestList {...props}/>
  </div>;
}

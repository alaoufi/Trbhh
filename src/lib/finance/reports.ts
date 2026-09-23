import {calculateFiscalLines, checkedFinanceBigInt, checkedFinanceInteger, sumFinanceMoney} from './calculations';
import {calculateFiscalLinesV2,fiscalTotalsV2} from './fiscal-v2';
import type {BudgetCategory, FinanceAccrual, FinanceData, FinanceInvoice, FinanceIssue, FinanceMetric, FinanceQuery, FinanceReport, FinanceSection, StatementMovement, SupplierBalance} from './types';
export {formatFinanceMoney} from './calculations';

export const financeSections:{key:FinanceSection;label:string}[] = [
  {key:'overview',label:'لوحة اليوم'},{key:'suppliers',label:'حسابات الموردين'},{key:'settlements',label:'التسويات'},
  {key:'budget',label:'ميزانية الشهر'},{key:'month-end',label:'ملخص الشهر'},{key:'cashflow',label:'التدفق النقدي'},
  {key:'close',label:'إقفال الشهر'},{key:'invoices',label:'أرشيف الفواتير'},{key:'reconciliation',label:'المطابقة'},
  {key:'tax',label:'مراجعة الضريبة'},{key:'ledger',label:'سجل الحركات'},{key:'expenses',label:'المصروفات'},
  {key:'returns',label:'المرتجعات المالية'},
];
export const budgetLabels:Record<BudgetCategory,string> = {
  sales:'المبيعات',trbhh_income:'دخل تربح',supplier_cost:'قيمة الموردين',shipping:'الشحن',payment_fees:'رسوم الدفع',
  marketing:'التسويق',hosting:'الاستضافة والخدمات',administration:'الإدارة',tax:'ضريبة المبيعات المسجلة',refunds:'الاستردادات النقدية',other:'مصروفات أخرى',
};
const DAY=86_400_000;
const monthPattern=/^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
const selectableMonthPattern=/^20\d{2}-(0[1-9]|1[0-2])$/;
const sum=sumFinanceMoney;
const sign=(value:{reversalOf:string|null})=>value.reversalOf?-1:1;
const fiscalSign=(value:{kind:string})=>value.kind==='credit_note'?-1:1;

function timestamp(value:string|Date):number {
  const result=value instanceof Date?value.getTime():Date.parse(value);
  if (!Number.isFinite(result)) throw new Error('Invalid finance date');
  return result;
}
/** Saudi dates use a fixed UTC+03:00 calendar; do not use the server timezone. */
export function monthOfDate(value:string|Date):string {
  return new Date(timestamp(value)+3*60*60*1000).toISOString().slice(0,7);
}
export function financeMonthBounds(month:string):{start:Date;end:Date} {
  if (!monthPattern.test(month)) throw new Error('Invalid finance month');
  const [year,number]=month.split('-').map(Number);
  return {start:new Date(Date.UTC(year,number-1,1,-3)),end:new Date(Date.UTC(year,number,1,-3))};
}
function previousMonth(month:string):string {
  return monthOfDate(new Date(financeMonthBounds(month).start.getTime()-1));
}
export function parseFinanceQuery(params:Record<string,string|undefined>,now=new Date()):FinanceQuery {
  const query:FinanceQuery={month:params.month&&selectableMonthPattern.test(params.month)?params.month:monthOfDate(now),section:financeSections.some(s=>s.key===params.section)?params.section as FinanceSection:'overview',mode:params.mode==='accountant'?'accountant':'simple'};
  for(const key of ['supplierId','q','status'] as const){
    const value=params[key]?.trim();
    if(value)query[key]=value.slice(0,key==='q'?200:100);
  }
  return query;
}
function sourceLink(query:FinanceQuery,section:FinanceSection,q?:string):string {
  const params=new URLSearchParams({month:query.month,section,mode:query.mode});
  if(query.supplierId)params.set('supplierId',query.supplierId);
  if(q)params.set('q',q);
  return `/admin/finance?${params.toString()}`;
}
function missingSupplierPolicy(invoice:FinanceInvoice):boolean {
  const lines=invoice.snapshot?.lines;
  if(!lines)return true;
  if(lines.some(l=>l.supplierId&&l.supplierMinor===undefined||!l.supplierId&&l.supplierMinor!==undefined))return true;
  return invoice.kind==='invoice'&&invoice.source.suppliers.some(s=>!lines.some(l=>l.supplierId===s.supplierId&&l.supplierMinor!==undefined));
}

/** Reject corrupted monetary inputs instead of producing plausible rounded totals. */
function validateMoney(data:FinanceData) {
  const check=(...amounts:number[])=>amounts.forEach(x=>checkedFinanceInteger(x));
  for(const order of data.orders){
    check(order.subtotalMinor,order.shippingMinor,order.totalMinor);
    for(const item of order.items){check(item.quantity,item.unitMinor,item.totalMinor);if(!item.quantity)throw new Error('Invalid order quantity');}
    order.suppliers.forEach(x=>check(x.amountMinor));
  }
  data.receipts.forEach(x=>check(x.amountMinor));
  data.refunds.forEach(x=>{check(x.amountMinor);if(x.amountMinor===0)throw new Error('Invalid refund amount');});
  data.accruals.forEach(x=>check(x.amountMinor));
  data.expenses.forEach(x=>check(x.netMinor,x.vatMinor,x.totalMinor,x.paidMinor));
  data.settlements.forEach(x=>{check(x.amountMinor);x.lines.forEach(l=>check(l.amountMinor));});
  data.budgets.forEach(x=>check(x.plannedMinor));
  data.invoices.forEach(x=>{
    check(x.totalMinor);if(x.netMinor!==null)check(x.netMinor);if(x.vatMinor!==null)check(x.vatMinor);
    if(x.snapshot){check(x.snapshot.netMinor,x.snapshot.vatMinor,x.snapshot.totalMinor,x.snapshot.paidMinor);x.snapshot.lines.forEach(l=>check(l.netMinor,l.vatMinor,l.grossMinor));}
  });
}

function periodProjection(data:FinanceData,query:FinanceQuery,now:Date) {
  const bounds=financeMonthBounds(query.month);
  const start=bounds.start.getTime();
  const cutoff=Math.min(bounds.end.getTime()-1,timestamp(now));
  const within=(at:string)=>timestamp(at)>=start&&timestamp(at)<=cutoff;
  const known=(at:string)=>timestamp(at)<=cutoff;
  const supplier=query.supplierId;
  const allOrders=new Map(data.orders.map(o=>[o.id,o]));
  const orderMatches=(id:string)=>!supplier||allOrders.get(id)?.suppliers.some(s=>s.supplierId===supplier)===true||data.accruals.some(a=>a.orderId===id&&a.supplierId===supplier);
  const orders=data.orders.filter(o=>orderMatches(o.id)&&known(o.createdAt));
  const receipts=data.receipts.filter(r=>orderMatches(r.orderId)&&known(r.at));
  const refunds=data.refunds.filter(r=>orderMatches(r.orderId)&&known(r.at));
  const accruals=data.accruals.filter(a=>(!supplier||a.supplierId===supplier)&&known(a.at));
  const settlements=data.settlements.filter(s=>(!supplier||s.supplierId===supplier)&&known(s.at));
  const posted=settlements.filter(s=>s.status==='approved'||s.status==='reversed');
  const expenses=supplier?[]:data.expenses.filter(e=>known(e.at));
  const invoices=data.invoices.filter(i=>orderMatches(i.orderId)&&known(i.at));
  const supplierAdjustments=invoices.filter(i=>i.status==='issued'&&i.kind!=='invoice').flatMap(invoice=>(invoice.snapshot?.lines??[]).flatMap((line,index)=>line.supplierId&&line.supplierMinor!==undefined&&(!supplier||line.supplierId===supplier)?[{id:`${invoice.id}:${index}`,invoiceId:invoice.id,at:invoice.at,orderId:invoice.orderId,productId:line.key,supplierId:line.supplierId,amountMinor:fiscalSign(invoice)*line.supplierMinor}]:[]));
  const sharedReceipt=!!supplier&&receipts.some(r=>new Set(allOrders.get(r.orderId)?.suppliers.map(s=>s.supplierId)).size>1);
  // A customer's whole payment is not a supplier cash receipt. Supplier cashflow
  // projections only contain their settlement movements; shared order values stay unknown.
  const recordedReceipts=supplier?[]:receipts;
  const recordedRefunds=supplier?[]:refunds;
  const allocations=new Map<string,number>();
  for(const settlement of posted)for(const line of settlement.lines)allocations.set(line.accrualId,sum([allocations.get(line.accrualId)??0,sign(settlement)*line.amountMinor]));
  const eligible=(a:typeof accruals[number])=>a.eligibleAt!==null&&a.dueAt!==null&&timestamp(a.eligibleAt)<=cutoff;
  const adjustment=(a:typeof accruals[number])=>sum(supplierAdjustments.filter(n=>n.orderId===a.orderId&&n.productId===a.productId&&n.supplierId===a.supplierId).map(n=>n.amountMinor));
  const remaining=(a:typeof accruals[number])=>sum([a.amountMinor,adjustment(a),-(allocations.get(a.id)??0)]);
  const suppliers:SupplierBalance[]=[];
  const supplierIds=new Set([...data.suppliers.filter(s=>!supplier||s.id===supplier).map(s=>s.id),...accruals.map(a=>a.supplierId),...settlements.map(s=>s.supplierId),...supplierAdjustments.map(n=>n.supplierId)]);
  for(const id of supplierIds){
    const supplierAccruals=accruals.filter(a=>a.supplierId===id);
    const supplierSettlements=posted.filter(s=>s.supplierId===id);
    const notes=supplierAdjustments.filter(n=>n.supplierId===id);
    const opening=sum([...supplierAccruals.filter(a=>timestamp(a.at)<start).map(a=>a.amountMinor),...notes.filter(n=>timestamp(n.at)<start).map(n=>n.amountMinor),...supplierSettlements.filter(s=>timestamp(s.at)<start).map(s=>-sign(s)*s.amountMinor)]);
    const accrued=sum([...supplierAccruals.filter(a=>within(a.at)).map(a=>a.amountMinor),...notes.filter(n=>within(n.at)).map(n=>n.amountMinor)]);
    const paid=sum(supplierSettlements.filter(s=>within(s.at)).map(s=>sign(s)*s.amountMinor));
    const due=supplierAccruals.filter(a=>eligible(a)&&timestamp(a.dueAt!)<=cutoff&&remaining(a)>0);
    const next=supplierAccruals.filter(a=>eligible(a)&&remaining(a)>0).map(a=>a.dueAt!).sort((a,b)=>timestamp(a)-timestamp(b))[0]??null;
    suppliers.push({id,name:data.suppliers.find(s=>s.id===id)?.name??id,openingMinor:opening,accruedMinor:accrued,paidMinor:paid,pendingMinor:sum(supplierAccruals.filter(a=>!eligible(a)).map(remaining)),remainingMinor:sum([opening,accrued,-paid]),dueMinor:sum(due.map(remaining)),overdueMinor:sum(due.filter(a=>timestamp(a.dueAt!)<cutoff).map(remaining)),nextDueAt:next,lastSettlementAt:supplierSettlements.filter(s=>!s.reversalOf).map(s=>s.at).sort((a,b)=>timestamp(b)-timestamp(a))[0]??null});
  }
  const monthInvoices=invoices.filter(i=>within(i.at));
  const monthReceipts=receipts.filter(r=>within(r.at));
  const policyUnknown=!data.ready||monthInvoices.some(i=>i.status!=='issued'||!i.snapshot||i.netMinor===null||i.vatMinor===null||!i.snapshot.policyReference)||monthReceipts.some(r=>!invoices.some(i=>i.receiptId===r.id&&i.kind==='invoice'))||orders.some(o=>o.paidAt&&within(o.paidAt)&&!invoices.some(i=>i.orderId===o.id&&i.kind==='invoice'));
  const supplierPolicyUnknown=monthInvoices.some(missingSupplierPolicy);
  const netSales=policyUnknown?null:sum(monthInvoices.map(i=>fiscalSign(i)*i.netMinor!));
  const fiscalSupplierCost=policyUnknown||supplierPolicyUnknown?null:sum(monthInvoices.flatMap(i=>i.snapshot!.lines.map(l=>fiscalSign(i)*(l.supplierMinor??0))));
  const income=supplier||netSales===null||fiscalSupplierCost===null?null:sum([netSales,-fiscalSupplierCost]);
  const monthlyExpenses=expenses.filter(e=>within(e.at));
  const expenseCategory=(category:BudgetCategory)=>sum(monthlyExpenses.filter(e=>e.category===category).map(e=>sign(e)*e.netMinor));
  const operating=sum(monthlyExpenses.filter(e=>['marketing','hosting','administration','other'].includes(e.category)).map(e=>sign(e)*e.netMinor));
  const cash=sum([...recordedReceipts.filter(r=>within(r.at)).map(r=>r.amountMinor),...recordedRefunds.filter(r=>within(r.at)).map(r=>-r.amountMinor),...posted.filter(s=>within(s.at)).map(s=>-sign(s)*s.amountMinor),...monthlyExpenses.map(e=>-sign(e)*e.paidMinor)]);
  const cumulativeCash=sum([...recordedReceipts.map(r=>r.amountMinor),...recordedRefunds.map(r=>-r.amountMinor),...posted.map(s=>-sign(s)*s.amountMinor),...expenses.map(e=>-sign(e)*e.paidMinor)]);
  const remainingExpenses=sum(expenses.map(e=>sign(e)*sum([e.totalMinor,-e.paidMinor])));
  // A recovery receivable is not collected cash. Keep gross unpaid obligations reserved.
  const available=sum([cumulativeCash,-sum(accruals.map(a=>Math.max(0,remaining(a)))),-remainingExpenses]);
  const anchor=query.month===monthOfDate(now)?timestamp(now):bounds.end.getTime()-1;
  // Reversal timestamps establish when a liability was cancelled; they must not
  // move that liability into a different due window or create negative payables.
  const expenseObligations=expenses.filter(e=>!e.reversalOf).map(e=>({dueAt:e.dueAt,amountMinor:sum([e.totalMinor,-e.paidMinor,...expenses.filter(r=>r.reversalOf===e.id).map(r=>-sum([r.totalMinor,-r.paidMinor]))])}));
  const commitments=(days:number)=>sum([
    ...accruals.filter(a=>eligible(a)&&timestamp(a.dueAt!)<=anchor+days*DAY).map(a=>Math.max(0,remaining(a))),
    ...expenseObligations.filter(e=>timestamp(e.dueAt)<=anchor+days*DAY).map(e=>Math.max(0,e.amountMinor)),
  ]);
  const metric=(key:string,label:string,valueMinor:number|null,section:FinanceSection,explanation:string):FinanceMetric=>({key,label,valueMinor,href:sourceLink(query,section),explanation});
  const metrics:FinanceMetric[]=[
    metric('sales','المبيعات المسجلة',supplier?null:sum([...orders.filter(o=>o.paidAt&&within(o.paidAt)).map(o=>o.totalMinor),...monthInvoices.filter(i=>i.kind!=='invoice').map(i=>fiscalSign(i)*i.totalMinor)]),'invoices','إجمالي الطلبات ذات الدفع الموثق في الشهر، مع الإشعارات الصادرة؛ لا يعاد حساب السعر من المنتج الحالي.'),
    metric('collected','المبالغ المحصلة',supplier?null:sum(monthReceipts.map(r=>r.amountMinor)),'reconciliation','المقبوضات الموثقة بتاريخ التحصيل. دفعة العميل المشتركة لا توزع نقديًا على الموردين دون مصدر تخصيص.'),
    metric('refunds','الاستردادات النقدية',supplier||!data.ready?null:sum(recordedRefunds.filter(r=>within(r.at)).map(r=>r.amountMinor)),'reconciliation','حركات رد المال الموثقة من مصدر موثوق بتاريخها؛ الإشعار الدائن وحده لا يثبت رد المال.'),
    metric('supplier_cost','قيمة الموردين',sum([...accruals.filter(a=>within(a.at)).map(a=>a.amountMinor),...supplierAdjustments.filter(n=>within(n.at)).map(n=>n.amountMinor)]),'suppliers','مستحقات الموردين المثبتة وقت الدفع وصافي إشعارات تعديل حصتهم خلال الشهر، وتشمل المعلق لحين اعتماد الأهلية.'),
    metric('supplier_paid','المدفوع للموردين',sum(posted.filter(s=>within(s.at)).map(s=>sign(s)*s.amountMinor)),'settlements','التسويات المعتمدة ناقص الحركات العكسية بتاريخها؛ المسودات مستبعدة.'),
    metric('supplier_remaining','المتبقي للموردين',sum(suppliers.map(s=>s.remainingMinor)),'suppliers','الرصيد المتراكم حتى تاريخ التقرير، شاملاً الرصيد الافتتاحي والمبالغ المعلقة.'),
    metric('trbhh_income','دخل تربح قبل المصروفات',income,'invoices','صافي الفواتير وفق السياسة المحفوظة ناقص قيمة المورد المحفوظة في لقطة الفاتورة؛ غير محسوم عند نقص السياسة.'),
    metric('operating_expenses','مصروفات التشغيل',supplier?null:operating,'expenses','صافي مصروفات التسويق والاستضافة والإدارة والأخرى المسجلة، بعد حركاتها العكسية.'),
    metric('payment_fees','رسوم الدفع',supplier?null:expenseCategory('payment_fees'),'expenses','صافي رسوم الدفع المسجلة كمصروف، دون افتراض رسوم من مبلغ الطلب.'),
    metric('shipping','مصروفات الشحن',supplier?null:expenseCategory('shipping'),'expenses','صافي مصروفات الشحن المسجلة؛ رسم الشحن المحصل من العميل ليس تلقائيًا تكلفة شحن.'),
    metric('vat','ضريبة المبيعات المسجلة',supplier||policyUnknown?null:sum(monthInvoices.map(i=>fiscalSign(i)*i.vatMinor!)),'tax','ضريبة الفواتير والإشعارات الصادرة فقط؛ ليست قيمة إقرار أو ضريبة مستحقة السداد، ولا تستنتج من السعر.'),
    metric('net_income','صافي دخل تربح المسجل',income===null?null:sum([income,-sum(monthlyExpenses.map(e=>sign(e)*e.netMinor))]),'month-end','دخل الفواتير وفق السياسة المعتمدة ناقص صافي المصروفات المسجلة؛ لا يشمل مصروفًا أو مرتجعًا غير مسجل.'),
    metric('cashflow','صافي الحركات النقدية المسجلة',cash,'cashflow','المقبوضات ناقص الاستردادات الموثقة والمدفوع من المصروفات وتسويات الموردين مع عكس الإلغاءات. ليس رصيد البنك الفعلي؛ لا يتضمن رصيدًا بنكيًا افتتاحيًا أو حركة خارج المصادر المتاحة.'),
  ];
  const actual=(category:BudgetCategory):number|null=>{
    const keys:Partial<Record<BudgetCategory,string>>={sales:'sales',trbhh_income:'trbhh_income',supplier_cost:'supplier_cost',shipping:'shipping',payment_fees:'payment_fees',tax:'vat',refunds:'refunds'};
    return keys[category]?metrics.find(m=>m.key===keys[category])!.valueMinor:supplier?null:expenseCategory(category);
  };
  const budget=(Object.keys(budgetLabels) as BudgetCategory[]).map(category=>{
    const planned=sum(data.budgets.filter(b=>b.month===query.month&&b.category===category).map(b=>b.plannedMinor));
    const value=actual(category);
    return {category,label:budgetLabels[category],plannedMinor:planned,actualMinor:value,differenceMinor:value===null?null:sum([value,-planned]),usagePercent:value===null||planned===0?null:Number((BigInt(value)*10000n)/BigInt(planned))/100};
  });
  const rawMovements:Omit<StatementMovement,'balanceMinor'>[]=[
    ...accruals.map(a=>{
      const left=remaining(a);const status=left===0?'paid':!eligible(a)?'held':(allocations.get(a.id)??0)>0?'partial':timestamp(a.dueAt!)>cutoff?'not_due':timestamp(a.dueAt!)<cutoff?'overdue':'due';
      return {id:a.id,at:a.at,label:'قيمة طلب للمورد',creditMinor:a.amountMinor,debitMinor:0,orderId:a.orderId,reference:a.id,href:sourceLink(query,'reconciliation',a.orderId),status};
    }),
    ...posted.map(s=>({id:s.id,at:s.at,label:s.reversalOf?'عكس تسوية مورد':'تسوية مورد',creditMinor:s.reversalOf?s.amountMinor:0,debitMinor:s.reversalOf?0:s.amountMinor,orderId:null,reference:s.reference,href:sourceLink(query,'settlements',s.id),status:s.reversalOf?'reversed':s.status})),
    ...supplierAdjustments.map(n=>({id:n.id,at:n.at,label:n.amountMinor<0?'تخفيض حصة المورد بإشعار دائن':'إعادة حصة المورد بإشعار مدين',creditMinor:Math.max(0,n.amountMinor),debitMinor:Math.max(0,-n.amountMinor),orderId:n.orderId,reference:n.invoiceId,href:sourceLink(query,'invoices',n.invoiceId),status:'adjustment'})),
  ];
  rawMovements.sort((a,b)=>timestamp(a.at)-timestamp(b.at)||a.id.localeCompare(b.id));
  let balance=0;
  const movements:StatementMovement[]=[];
  const opening=sum(suppliers.map(s=>s.openingMinor));
  if(opening!==0)movements.push({id:'opening',at:bounds.start.toISOString(),label:'الرصيد الافتتاحي',creditMinor:Math.max(0,opening),debitMinor:Math.max(0,-opening),balanceMinor:opening,orderId:null,reference:query.month,href:sourceLink({...query,month:previousMonth(query.month)},'suppliers'),status:'opening'});
  for(const movement of rawMovements){balance=sum([balance,movement.creditMinor,-movement.debitMinor]);if(within(movement.at))movements.push({...movement,balanceMinor:balance});}
  return {start,cutoff,within,known,orders,receipts,refunds,accruals,settlements,posted,expenses,invoices,supplierAdjustments,adjustment,allocations,eligible,remaining,suppliers,metrics,budget,movements,availableMinor:available,due7Minor:commitments(7),due30Minor:commitments(30),sharedReceipt};
}

/** Selection preview shares the ledger arithmetic; approval must recheck in its DB transaction. */
export function settlementCandidates(data:FinanceData,supplierId:string,now=new Date()):{accrual:FinanceAccrual;remainingMinor:number}[] {
  if(!data.ready)return [];
  validateMoney(data);
  const projection=periodProjection(data,{month:monthOfDate(now),section:'settlements',mode:'simple',supplierId},now);
  if(projection.accruals.some(a=>projection.remaining(a)<0))return [];
  const reserved=new Set(projection.settlements.filter(s=>s.status==='draft').flatMap(s=>s.lines.map(l=>l.accrualId)));
  return projection.accruals.filter(a=>projection.eligible(a)&&timestamp(a.dueAt!)<=timestamp(now)&&!reserved.has(a.id)).map(accrual=>({accrual,remainingMinor:projection.remaining(accrual)})).filter(c=>c.remainingMinor>0);
}

export function buildFinanceReport(data:FinanceData,query:FinanceQuery,now=new Date()):FinanceReport {
  validateMoney(data);
  const projection=periodProjection(data,query,now);
  const previous=periodProjection(data,{...query,month:previousMonth(query.month)},now);
  const issues:FinanceIssue[]=[];
  const issue=(key:string,message:string,section:FinanceSection='reconciliation',q?:string,differenceMinor?:number,severity:'error'|'warning'='error')=>issues.push({key,message,severity,href:sourceLink(query,section,q),...(differenceMinor===undefined?{}:{differenceMinor})});
  const difference=(key:string,actual:number,expected:number,message:string,section:FinanceSection,q:string)=>{const delta=sum([actual,-expected]);if(delta!==0)issue(key,message,section,q,delta);};
  if(!data.ready)issue('data_unavailable','مصادر المتابعة المالية غير جاهزة؛ لا يمكن اعتماد هذا التقرير للإقفال.','close');
  issue('cash_scope','التدفق والمتاح مبنيان على الحركات المسجلة فقط. الرصيد البنكي الفعلي والتزام الضريبة غير متاحين من هذه المصادر.','cashflow',undefined,undefined,'warning');
  if(projection.sharedReceipt)issue('supplier_cash_scope','دفعة هذا الطلب تخص عدة موردين؛ لا يمكن نسبتها نقديًا لهذا المورد.','suppliers',query.supplierId,undefined,'warning');
  const duplicates=(values:string[],prefix:string,label:string,section:FinanceSection)=>{
    const seen=new Set<string>();for(const value of values){if(seen.has(value))issue(`${prefix}:${value}`,label,section,value);seen.add(value);}
  };
  duplicates(projection.receipts.map(r=>r.id),'receipt_duplicate_id','معرف مقبوض مكرر.','reconciliation');
  duplicates(projection.refunds.map(r=>r.id),'refund_duplicate_id','معرف استرداد مكرر.','reconciliation');
  duplicates(projection.refunds.map(r=>JSON.stringify([r.provider,r.externalId])),'refund_duplicate_event','حدث رد مال مكرر من المصدر الخارجي.','reconciliation');
  duplicates(projection.orders.map(o=>o.id),'order_duplicate_id','معرف طلب مكرر.','reconciliation');
  duplicates(projection.expenses.map(e=>e.id),'expense_duplicate_id','معرف مصروف مكرر.','expenses');
  duplicates(projection.accruals.map(a=>a.id),'accrual_duplicate_id','معرف استحقاق مكرر.','suppliers');
  duplicates(projection.settlements.map(s=>s.id),'settlement_duplicate_id','معرف تسوية مكرر.','settlements');
  duplicates(projection.invoices.map(i=>i.id),'invoice_duplicate_id','معرف فاتورة مكرر.','invoices');
  duplicates(projection.receipts.filter(r=>r.reference).map(r=>JSON.stringify([r.provider,r.reference])),'receipt_duplicate_reference','مرجع دفع مكرر لدى نفس المزود؛ راجع تكرار حدث التحصيل.','reconciliation');
  duplicates(projection.invoices.filter(i=>i.kind==='invoice').map(i=>i.receiptId),'invoice_duplicate_receipt','أكثر من فاتورة أصلية لنفس المقبوض.','invoices');
  duplicates(projection.invoices.filter(i=>i.number).map(i=>i.number!),'invoice_duplicate_number','رقم فاتورة مكرر.','invoices');
  duplicates(projection.accruals.map(a=>`${a.orderId}:${a.productId}:${a.supplierId}`),'accrual_duplicate','استحقاق مورد مكرر لنفس بند الطلب.','suppliers');
  for(const order of projection.orders){
    if(order.currency!=='SAR')issue(`order_currency:${order.id}`,'عملة الطلب لا تطابق عملة التقرير.','reconciliation',order.id);
    const issued=data.invoices.find(x=>x.orderId===order.id&&x.kind==='invoice'&&x.snapshot?.version===2)?.snapshot;
    const fiscal=data.orderFiscalSnapshots?.find(x=>x.orderId===order.id)??(issued?.version===2?issued:null);
    for(const item of order.items){
      let expected=checkedFinanceBigInt(BigInt(item.unitMinor)*BigInt(item.quantity));
      if(fiscal){
        const line=fiscal.lines.find(x=>x.key===item.productId&&x.component==='product');
        if(!line||line.unitPriceMinor!==item.unitMinor||line.quantity!==item.quantity||line.title!==item.title){issue(`item_fiscal_source:${order.id}:${item.productId}`,'بند الطلب لا يطابق لقطة التسعير الضريبي المحفوظة.','reconciliation',order.id);continue;}
        try{expected=calculateFiscalLinesV2([line]).totalMinor;}catch{issue(`item_fiscal_math:${order.id}:${item.productId}`,'تعذر حساب بند الطلب وفق لقطة التسعير المحفوظة.','reconciliation',order.id);continue;}
      }
      difference(`item_total:${order.id}:${item.productId}`,item.totalMinor,expected,'قيمة بند الطلب لا تطابق سعره وكميته وأساسه الضريبي المحفوظ.','reconciliation',order.id);
    }
    difference(`order_items:${order.id}`,sum(order.items.map(i=>i.totalMinor)),order.subtotalMinor,'مجموع بنود الطلب لا يطابق المجموع الفرعي المحفوظ.','reconciliation',order.id);
    difference(`order_total:${order.id}`,sum([order.subtotalMinor,order.shippingMinor]),order.totalMinor,'المجموع الفرعي والشحن لا يطابقان إجمالي الطلب.','reconciliation',order.id);
    if(!order.paidAt||!projection.known(order.paidAt))continue;
    const receipts=projection.receipts.filter(r=>r.orderId===order.id);
    if(receipts.length===0)issue(`receipt_missing:${order.id}`,'طلب مدفوع بلا مقبوض موثق.','reconciliation',order.id);
    if(receipts.length>1)issue(`receipt_duplicate_order:${order.id}`,'أكثر من مقبوض لنفس حدث دفع الطلب؛ يلزم مراجعة المصدر.','reconciliation',order.id);
    difference(`receipt_total:${order.id}`,sum(receipts.map(r=>r.amountMinor)),order.totalMinor,'التحصيل لا يطابق إجمالي الطلب حتى الهللة.','reconciliation',order.id);
    for(const snapshot of order.suppliers.filter(s=>!query.supplierId||s.supplierId===query.supplierId)){
      const actual=sum(projection.accruals.filter(a=>a.orderId===order.id&&a.productId===snapshot.productId&&a.supplierId===snapshot.supplierId).map(a=>a.amountMinor));
      difference(`accrual_source:${order.id}:${snapshot.productId}`,actual,snapshot.amountMinor,'استحقاق المورد لا يطابق تكلفة المورد المحفوظة وقت الطلب.','suppliers',order.id);
    }
  }
  for(const receipt of projection.receipts){
    const order=data.orders.find(o=>o.id===receipt.orderId);
    if(!order||!order.paidAt||!projection.known(order.paidAt))issue(`receipt_source:${receipt.id}`,'المقبوض بلا طلب ذي دفع موثق.','reconciliation',receipt.id);
    if(receipt.currency!=='SAR'||order&&receipt.currency!==order.currency)issue(`receipt_currency:${receipt.id}`,'عملة المقبوض لا تطابق الطلب والتقرير.','reconciliation',receipt.id);
    if(!projection.invoices.some(i=>i.receiptId===receipt.id&&i.kind==='invoice'))issue(`invoice_missing:${receipt.id}`,'المقبوض يفتقد سجل الفاتورة المستقل.','invoices',receipt.orderId);
    const refunded=sum(projection.refunds.filter(r=>r.receiptId===receipt.id).map(r=>r.amountMinor));
    if(refunded>receipt.amountMinor)issue(`refund_exceeds_receipt:${receipt.id}`,'الاستردادات الموثقة تتجاوز ما تم تحصيله من هذه الدفعة.','reconciliation',receipt.orderId,sum([refunded,-receipt.amountMinor]));
    const credited=sum(projection.invoices.filter(i=>i.receiptId===receipt.id&&i.status==='issued'&&i.kind!=='invoice').map(i=>-fiscalSign(i)*i.totalMinor));
    difference(`refund_credit_difference:${receipt.id}`,refunded,credited,'رد المال الموثق لا يطابق صافي الإشعارات الدائنة والمدينة؛ يلزم استكمال المستند أو مطابقة الحركة.','reconciliation',receipt.orderId);
  }
  for(const refund of projection.refunds){
    const receipt=data.receipts.find(r=>r.id===refund.receiptId);
    if(!receipt||receipt.orderId!==refund.orderId||receipt.provider!==refund.provider||receipt.currency!==refund.currency||refund.currency!=='SAR'||timestamp(refund.at)<timestamp(receipt.at)||!refund.externalId||!refund.evidenceRef||!refund.actorId)issue(`refund_source:${refund.id}`,'حركة الاسترداد لا تطابق المقبوض والمزود والعملة أو تفتقد إثباتها الموثق.','reconciliation',refund.orderId);
  }
  for(const accrual of projection.accruals){
    const order=data.orders.find(o=>o.id===accrual.orderId);
    if(!order?.paidAt||!projection.known(order.paidAt)||!order.suppliers.some(s=>s.supplierId===accrual.supplierId&&s.productId===accrual.productId))issue(`accrual_orphan:${accrual.id}`,'استحقاق مورد بلا دفع موثق وبند مطابق في لقطة الطلب.','suppliers',accrual.orderId);
    if(!projection.eligible(accrual)&&projection.remaining(accrual)>0)issue(`eligibility:${accrual.id}`,'استحقاق معلق: لم تعتمد الأهلية وموعد التسوية أو لم يحل تاريخ الأهلية.','suppliers',accrual.id);
    if(projection.remaining(accrual)<0){
      const legitimateRecovery=projection.adjustment(accrual)<0&&(projection.allocations.get(accrual.id)??0)<=accrual.amountMinor;
      issue(`${legitimateRecovery?'supplier_recovery':'overpayment'}:${accrual.id}`,legitimateRecovery?'رصيد مستحق على المورد بعد مرتجع موثق؛ التسويات السابقة محفوظة، ويلزم إثبات استرداده قبل تسوية جديدة.':'التسويات تتجاوز الاستحقاق المحفوظ.','settlements',accrual.id,projection.remaining(accrual),legitimateRecovery?'warning':'error');
    }
    if(projection.adjustment(accrual)>0||sum([accrual.amountMinor,projection.adjustment(accrual)])<0)issue(`note_supplier_limit:${accrual.id}`,'صافي تعديل المورد يتجاوز حصته الأصلية أو يعيد أكثر من التخفيض السابق.','invoices',accrual.orderId);
    if((projection.allocations.get(accrual.id)??0)<0)issue(`settlement_negative:${accrual.id}`,'الحركات العكسية تتجاوز المدفوع على هذا الاستحقاق.','settlements',accrual.id);
  }
  for(const settlement of projection.settlements){
    if(settlement.status==='cancelled')continue;
    if(settlement.status==='draft'){issue(`settlement_draft:${settlement.id}`,'تسوية بانتظار الاعتماد؛ لم تدخل في المدفوع.','settlements',settlement.id,undefined,'warning');continue;}
    difference(`settlement_total:${settlement.id}`,sum(settlement.lines.map(l=>l.amountMinor)),settlement.amountMinor,'توزيع التسوية لا يطابق إجماليها.','settlements',settlement.id);
    if(!settlement.reference)issue(`settlement_reference:${settlement.id}`,'تسوية معتمدة بلا مرجع تحويل.','settlements',settlement.id);
    duplicates(settlement.lines.map(l=>l.accrualId),`settlement_line_duplicate:${settlement.id}`,'بند استحقاق مكرر داخل التسوية.','settlements');
    for(const line of settlement.lines){
      const accrual=data.accruals.find(a=>a.id===line.accrualId);
      if(!accrual||accrual.supplierId!==settlement.supplierId||timestamp(accrual.at)>timestamp(settlement.at))issue(`settlement_source:${settlement.id}:${line.accrualId}`,'بند التسوية لا يطابق المورد أو استحقاقًا موجودًا وقت التسوية.','settlements',settlement.id);
      else if(!settlement.reversalOf&&(!accrual.eligibleAt||!accrual.dueAt||timestamp(accrual.eligibleAt)>timestamp(settlement.at)||timestamp(accrual.dueAt)>timestamp(settlement.at)))issue(`settlement_eligibility:${settlement.id}:${line.accrualId}`,'سدد الاستحقاق قبل تحقق أهلية وموعد التسوية.','settlements',settlement.id);
    }
    if(settlement.reversalOf){
      const original=data.settlements.find(s=>s.id===settlement.reversalOf);
      const reversalLines=[...settlement.lines].sort((a,b)=>a.accrualId.localeCompare(b.accrualId));
      const originalLines=original?[...original.lines].sort((a,b)=>a.accrualId.localeCompare(b.accrualId)):[];
      if(!original||original.reversalOf||!['approved','reversed'].includes(original.status)||original.supplierId!==settlement.supplierId||timestamp(original.at)>timestamp(settlement.at)||original.amountMinor!==settlement.amountMinor||JSON.stringify(reversalLines)!==JSON.stringify(originalLines))issue(`settlement_reversal:${settlement.id}`,'الحركة العكسية لا تطابق التسوية الأصلية.','settlements',settlement.id);
    } else if(settlement.status==='reversed'&&!data.settlements.some(s=>s.reversalOf===settlement.id&&s.status!=='draft'))issue(`settlement_reversal_missing:${settlement.id}`,'التسوية معلّمة كمعكوسة لكن حركتها العكسية مفقودة.','settlements',settlement.id);
  }
  duplicates(projection.posted.filter(s=>s.reversalOf).map(s=>s.reversalOf!),'settlement_reversal_duplicate','تم عكس التسوية أكثر من مرة.','settlements');
  for(const note of projection.supplierAdjustments)if(!projection.accruals.some(a=>a.orderId===note.orderId&&a.productId===note.productId&&a.supplierId===note.supplierId))issue(`note_supplier_source:${note.id}`,'حصة المورد في الإشعار لا ترتبط باستحقاق بند الطلب الأصلي.','invoices',note.orderId);
  for(const expense of projection.expenses){
    difference(`expense_total:${expense.id}`,sum([expense.netMinor,expense.vatMinor]),expense.totalMinor,'صافي المصروف والضريبة لا يطابقان الإجمالي.','expenses',expense.id);
    if(expense.paidMinor>expense.totalMinor)issue(`expense_overpaid:${expense.id}`,'مدفوع المصروف يتجاوز قيمته.','expenses',expense.id);
    if(expense.reversalOf){
      const original=data.expenses.find(e=>e.id===expense.reversalOf);
      if(!original||original.reversalOf||original.category!==expense.category||original.netMinor!==expense.netMinor||original.vatMinor!==expense.vatMinor||original.totalMinor!==expense.totalMinor||original.paidMinor!==expense.paidMinor||timestamp(original.at)>timestamp(expense.at))issue(`expense_reversal:${expense.id}`,'عكس المصروف لا يطابق المصروف الأصلي.','expenses',expense.id);
    }
  }
  duplicates(projection.expenses.filter(e=>e.reversalOf).map(e=>e.reversalOf!),'expense_reversal_duplicate','تم عكس المصروف أكثر من مرة.','expenses');
  for(const invoice of projection.invoices){
    if(invoice.status==='cancelled'){issue(`invoice_cancelled:${invoice.id}`,'ألغيت مسودة الفاتورة؛ المقبوض محفوظ ويتطلب مراجعة تصحيحية، ولا يجوز إصدار المسودة الملغاة.','invoices',invoice.orderId);continue;}
    if(invoice.status==='pending_policy'){issue(`pending_policy:${invoice.id}`,'الفاتورة قيد تجهيز السياسة: لا يمكن حسم الضريبة أو الدخل ولا إقفال الشهر.','invoices',invoice.orderId);continue;}
    const snapshot=invoice.snapshot;
    if(!snapshot||invoice.netMinor===null||invoice.vatMinor===null||!invoice.number||!snapshot.policyReference){issue(`invoice_snapshot_missing:${invoice.id}`,'الفاتورة الصادرة تفتقد لقطة مالية أو رقمًا أو سياسة إصدار محفوظة.','invoices',invoice.orderId);continue;}
    const receipt=data.receipts.find(r=>r.id===invoice.receiptId);
    if(snapshot.sourceOrderId!==invoice.orderId||snapshot.sourceReceiptId!==invoice.receiptId||invoice.source.id!==invoice.orderId||!receipt||receipt.orderId!==invoice.orderId||snapshot.currency!=='SAR')issue(`invoice_source:${invoice.id}`,'روابط الفاتورة واللقطة والمقبوض لا تشير إلى نفس المصدر.','invoices',invoice.orderId);
    if(invoice.kind==='invoice'){
      difference(`invoice_receipt:${invoice.id}`,invoice.totalMinor,receipt?.amountMinor??0,'إجمالي الفاتورة لا يطابق المقبوض.','invoices',invoice.orderId);
      difference(`invoice_order_snapshot:${invoice.id}`,invoice.source.totalMinor,invoice.totalMinor,'لقطة الطلب في الفاتورة لا تطابق الإجمالي الصادر.','invoices',invoice.orderId);
      difference(`invoice_paid:${invoice.id}`,snapshot.paidMinor,receipt?.amountMinor??0,'المبلغ المدفوع في لقطة الفاتورة لا يطابق المقبوض المرتبط.','invoices',invoice.orderId);
      const supplierIds=new Set([...invoice.source.suppliers.map(s=>s.supplierId),...snapshot.lines.flatMap(l=>l.supplierId?[l.supplierId]:[])]);
      for(const id of supplierIds)difference(`invoice_supplier:${invoice.id}:${id}`,sum(snapshot.lines.filter(l=>l.supplierId===id).map(l=>l.supplierMinor??0)),sum(invoice.source.suppliers.filter(s=>s.supplierId===id).map(s=>s.amountMinor)),'حصة المورد في لقطة الفاتورة لا تطابق تكلفة المورد المحفوظة.','invoices',invoice.orderId);
    }
    difference(`invoice_net_vat:${invoice.id}`,sum([invoice.netMinor,invoice.vatMinor]),invoice.totalMinor,'صافي الفاتورة وضريبتها لا يطابقان إجماليها.','invoices',invoice.orderId);
    for(const field of ['netMinor','vatMinor','totalMinor'] as const)difference(`invoice_snapshot_${field}:${invoice.id}`,snapshot[field],invoice[field]!,'إجمالي لقطة الفاتورة يختلف عن السجل المالي.','invoices',invoice.orderId);
    try {
      const calculated=snapshot.version===1?calculateFiscalLines(snapshot.lines):snapshot.derivation==='sale'?calculateFiscalLinesV2(snapshot.lines):fiscalTotalsV2(snapshot.lines.map(line=>{
        for(const value of [line.quantity,line.discountMinor,line.unitPriceMinor,line.netMinor,line.vatMinor,line.grossMinor])checkedFinanceInteger(value);
        if(line.netMinor+line.vatMinor!==line.grossMinor)throw new Error('finance_note_difference');return line;
      }));
      for(const field of ['netMinor','vatMinor','totalMinor'] as const)difference(`invoice_lines_${field}:${invoice.id}`,calculated[field],snapshot[field],'مجموع البنود المحسوب لا يطابق لقطة الفاتورة.','invoices',invoice.orderId);
      snapshot.lines.forEach((line,index)=>{
        for(const field of ['netMinor','vatMinor','grossMinor'] as const)difference(`invoice_line_${field}:${invoice.id}:${index}`,line[field],calculated.lines[index][field],'قيمة محفوظة في بند الفاتورة تختلف عن حسابه الصريح حتى الهللة.','invoices',invoice.orderId);
      });
    } catch {issue(`invoice_math_invalid:${invoice.id}`,'تحتوي لقطة الفاتورة قيمًا لا تسمح بحساب مالي صحيح.','invoices',invoice.orderId);}
    if(missingSupplierPolicy(invoice))issue(`supplier_policy_missing:${invoice.id}`,'حصة المورد في لقطة الفاتورة غير محددة؛ دخل تربح غير محسوم.','invoices',invoice.orderId);
    if(invoice.kind!=='invoice'){
      const parent=data.invoices.find(i=>i.id===invoice.parentId);
      if(!parent||parent.kind!=='invoice'||parent.status!=='issued'||parent.orderId!==invoice.orderId||timestamp(parent.at)>timestamp(invoice.at)||!invoice.reason)issue(`invoice_parent:${invoice.id}`,'الإشعار يفتقد فاتورة أصلية صادرة أو سببًا أو رابط طلب مطابقًا.','invoices',invoice.orderId);
    }
  }
  for(const invoice of projection.invoices.filter(i=>i.kind==='invoice')){
    const notes=projection.invoices.filter(i=>i.parentId===invoice.id&&i.kind!=='invoice'&&i.status==='issued');
    const netCredit=sum(notes.map(i=>-fiscalSign(i)*i.totalMinor));
    const netVat=sum(notes.map(i=>-fiscalSign(i)*(i.vatMinor??0)));
    if(netCredit<0||netCredit>invoice.totalMinor||netVat<0||invoice.vatMinor!==null&&netVat>invoice.vatMinor)issue(`credit_exceeds_invoice:${invoice.id}`,'صافي الإشعارات يتجاوز مبلغ الفاتورة أو ضريبتها، أو يعيد أكثر مما سبق تخفيضه.','invoices',invoice.orderId);
    for(const note of notes)for(const line of note.snapshot?.lines??[]){
      const original=invoice.snapshot?.lines.find(l=>l.key===line.key);
      if(!original||line.title!==original.title||('unitNetMinor' in line&&'unitNetMinor' in original?line.unitNetMinor!==original.unitNetMinor:'unitPriceMinor' in line&&'unitPriceMinor' in original?line.unitPriceMinor!==original.unitPriceMinor||line.priceBasis!==original.priceBasis:true)||line.vatBps!==original.vatBps||line.supplierId!==original.supplierId||(line.supplierMinor===undefined)!==(original.supplierMinor===undefined))issue(`note_line_identity:${note.id}:${line.key}`,'هوية بند الإشعار أو سياسته لا تطابق بند الفاتورة الأصلية.','invoices',note.orderId);
    }
    for(const line of invoice.snapshot?.lines??[])for(const field of ['quantity','netMinor','vatMinor','grossMinor','supplierMinor'] as const){
      const net=sum(notes.flatMap(note=>(note.snapshot?.lines??[]).filter(l=>l.key===line.key).map(l=>-fiscalSign(note)*(l[field]??0))));
      if(net<0||net>(line[field]??0))issue(`note_line_limit:${invoice.id}:${line.key}:${field}`,'صافي الإشعارات لبند واحد يتجاوز كميته أو قيمته الأصلية أو يعيد أكثر من التخفيض السابق.','invoices',invoice.orderId);
    }
  }
  for(const budget of projection.budget)if(budget.usagePercent!==null&&budget.usagePercent>=80&& !['sales','trbhh_income'].includes(budget.category))issue(`budget_warning:${budget.category}`,`بلغ بند ${budget.label} ${budget.usagePercent}% من الميزانية.`, 'budget',budget.category,undefined,'warning');
  return {query,metrics:projection.metrics,previousMetrics:previous.metrics,suppliers:projection.suppliers,movements:projection.movements,budget:projection.budget,issues,due7Minor:projection.due7Minor,due30Minor:projection.due30Minor,availableMinor:projection.availableMinor,canClose:data.ready&&!issues.some(i=>i.severity==='error'),data};
}

import Link from 'next/link';
import {randomUUID} from 'node:crypto';
import {requireAccess} from '@/lib/access-control/guards';
import {AccessBoundary} from '@/components/access-boundary';
import {CjAdminNav} from '@/components/cj/admin-nav';
import {listCjPayables,listCjSettlementBatches,getCjSettlementBatch,getCjSettlementWaitHours} from '@/lib/cj/settlements';
import {PayableSelection} from './selection';
import {refreshSettlement,saveSettlementWait,authorizeWalletSettlement} from './actions';
import {settlementPaymentUrl} from './policy';

export const dynamic = 'force-dynamic';
export const metadata = {title:'مستحقات CJ',robots:{index:false,follow:false}};
const errors:Record<string,string> = {selection:'حدد من طلب واحد إلى 20 طلبًا صالحًا دون تكرار.',confirmation:'راجع المستحقات وأكد التحديد أولاً.',changed:'تغيّرت حالة طلب أو سبق ضمه إلى دفعة. حدّث القائمة وراجعها.',wait:'مدة الانتظار يجب أن تكون بين ساعة و168 ساعة.',refresh:'تعذر تحديث المطابقة. لا تعد الدفع قبل التأكد من حالة كل طلب.'};
errors.wallet_confirmation='السداد من المحفظة يحتاج تأكيدًا صريحًا بالمبلغ المعروض.';
errors.wallet_changed='رفض تفويض الخصم: تغيّرت حالة طلب أو مبلغ أو انتهى رابط الدفع. حدّث حالة الطلبات قبل إعادة المحاولة.';
const usd = (minor:number) => `$${(minor/100).toFixed(2)}`;

export default async function CjPayablesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  await requireAccess('orders','view');
  await requireAccess('wallets','view');
  const sp = await searchParams;
  const batchId = typeof sp.batch==='string'&&/^[1-9]\d{0,19}$/.test(sp.batch)&&BigInt(sp.batch)<=18446744073709551615n?sp.batch:null;
  const [rows,hours,batch,batches] = await Promise.all([listCjPayables(),getCjSettlementWaitHours(),batchId?getCjSettlementBatch(batchId):null,listCjSettlementBatches()]);
  return <div className="space-y-4">
    <CjAdminNav current="orders"/>
    <h1 className="text-xl font-extrabold text-primary">مستحقات CJ</h1>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-3">هذه طلبات تحصّل مبلغها في تربح وثبت إيصالها، ولم يثبت سدادها للمورد. تجميعها سجل محاسبي؛ لا تُنشأ عملية خصم أو طلب CJ جديد من هذه الصفحة.</p>
    {typeof sp.error==='string'&&errors[sp.error]&&<p role="alert" className="rounded border border-red-200 bg-red-50 p-3">{errors[sp.error]}</p>}
    {sp.saved==='1'&&<p className="text-emerald-700">تم حفظ مهلة الانتظار.</p>}
    {sp.authorized==='1'&&<p className="rounded border border-amber-300 bg-amber-50 p-3">سُجّل إذن السداد من المحفظة لهذه الدفعة. هذا ليس تأكيد خصم؛ ينفذ العامل كل طلب مستقلاً بعد التحقق ثم يعرض نتيجة المطابقة.</p>}
    <section className="rounded-xl border p-4 space-y-3"><h2 className="font-bold">حد انتظار مستحقات العميل</h2><p>المهلة الحالية: {hours} ساعة. تجاوزها يرفع تنبيهًا واضحًا للسداد الفوري؛ المهلة لا تمنح إذن الخصم الآلي.</p><AccessBoundary module="integrations" action="manage_settings"><AccessBoundary module="orders" action="edit"><form action={saveSettlementWait} className="flex flex-wrap gap-2"><label>المدة بالساعات <input name="hours" type="number" min="1" max="168" step="1" defaultValue={hours} className="w-20 rounded border p-2"/></label><button className="rounded bg-primary px-3 py-2 text-white">حفظ المهلة</button></form></AccessBoundary></AccessBoundary></section>
    <section className="rounded-xl border p-4 space-y-3"><h2 className="font-bold">طلبات جاهزة للتجميع ({rows.length})</h2>{rows.length?<AccessBoundary module="orders" action="edit"><PayableSelection rows={rows} requestKey={randomUUID()}/></AccessBoundary>:<p>لا توجد طلبات مؤهلة غير مضمومة إلى دفعة. الطلب غير المحصّل أو المسدد للمورد لا يدخل هذه القائمة.</p>}</section>
    <section className="rounded-xl border p-4 space-y-2"><h2 className="font-bold">سجل الدفعات الأخيرة</h2>{batches.length?<ul>{batches.map(item=><li key={item.id}><Link href={`/admin/suppliers/cj/payables?batch=${item.id}`} className="text-primary underline">الدفعة {item.id}</Link> · <span dir="ltr">{usd(item.totalUsdMinor)}</span> · {item.status==='settled'?'مطابقة مكتملة':'لم تكتمل المطابقة'}</li>)}</ul>:<p>لا دفعات مسجلة بعد.</p>}</section>
    {batch&&<section className="rounded-xl border p-4 space-y-3"><h2 className="font-bold">الدفعة {batch.id} · {batch.status==='settled'?'اكتملت مطابقة السداد':'بانتظار مطابقة كل طلب'}</h2><p>إجمالي المستحقات المسجلة: <b dir="ltr">{usd(batch.totalUsdMinor)}</b></p><ul className="space-y-2">{batch.lines.map(line=>{const paymentUrl=settlementPaymentUrl(line.paymentUrl,line.payExpiresAt);return <li key={line.id} className="rounded border p-3 space-y-2"><p>طلب تربح {line.commerceOrderId} · طلب CJ <span dir="ltr">{line.cjOrderId}</span> · <b dir="ltr">{usd(line.totalUsdMinor)}</b> · {line.status==='paid'?'سداد المورد مؤكد':'لم يثبت سداد المورد'}</p>{paymentUrl?<a href={paymentUrl} target="_blank" rel="noreferrer" className="inline-block rounded border px-3 py-2 text-primary">سداد هذا الطلب ببطاقة على CJ ↗</a>:line.status!=='paid'?<p className="text-amber-800">لا يوجد رابط بطاقة صالح حاليًا؛ حدّث المطابقة ولا تكرر الدفع إذا كانت نتيجته غير مؤكدة.</p>:null}</li>;})}</ul><AccessBoundary module="orders" action="edit"><form action={refreshSettlement}><input type="hidden" name="batchId" value={batch.id}/><button className="rounded bg-primary px-4 py-2 text-white">تحديث مطابقة كل طلب من CJ — بلا خصم</button></form>{batch.status!=='settled'&&batch.lines.every(line=>line.status!=='paid')&&<AccessBoundary module="wallets" action="edit"><form action={authorizeWalletSettlement} className="mt-3 space-y-2 rounded border border-red-200 p-3"><input type="hidden" name="batchId" value={batch.id}/><input type="hidden" name="expectedTotalUsdMinor" value={batch.totalUsdMinor}/><label className="flex items-start gap-2"><input type="checkbox" name="confirmWalletDebit" value="1" required/><span>أوافق صراحة على خصم إجمالي <b dir="ltr">{usd(batch.totalUsdMinor)}</b> من محفظة CJ للطلبات المحددة أعلاه، كل طلب مستقلاً بعد إعادة التحقق. لا أوافق على أي زيادة في المبلغ.</span></label><button className="rounded bg-red-700 px-4 py-2 font-bold text-white">تفويض السداد من محفظة CJ لهذه الدفعة</button></form></AccessBoundary>}</AccessBoundary></section>}
    <section className="rounded-xl border p-4 space-y-2"><h2 className="font-bold">السداد الرسمي والتتبع</h2><p>لا نفترض وجود رابط بطاقة واحد عبر API لعدة طلبات. افتح حساب CJ الرسمي وحدد الطلبات المستحقة في صفحة الطلبات لإتمام السداد المجمع بالطريقة المتاحة لحسابك. كل طلب يطابق مستقلاً؛ الرجوع من الدفع وحده لا يثبت وصول المبلغ.</p><a href="https://www.cjdropshipping.com/home" target="_blank" rel="noreferrer" className="inline-block rounded border px-3 py-2 font-bold text-primary">فتح حساب CJ الرسمي ثم الطلبات ↗</a><p>الدفع من محفظة CJ يحتاج موافقة مالية صريحة لكل تنفيذ؛ لا يوجد خصم آلي افتراضي.</p><Link href="/admin/suppliers/cj/orders" className="inline-block text-primary underline">مراقبة حالات الطلبات والشحن والتتبع</Link></section>
  </div>;
}

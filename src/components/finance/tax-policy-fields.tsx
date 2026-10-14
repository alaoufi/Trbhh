'use client';
import {useState} from 'react';
import type {FinanceTaxPolicy} from '@/lib/finance/types';
import {DEFAULT_REGISTRATION_THRESHOLD_MINOR} from '@/lib/finance/tax-registration';
import styles from './finance.module.css';
const priceBasisLabels={inclusive:'شامل الضريبة',exclusive:'غير شامل الضريبة'};
function PolicySelect({name,label,options,initial}:{name:string;label:string;options:readonly (readonly [string,string])[];initial?:string}) {
  return <label className={styles.field}>{label}<select name={name} className={styles.input} required defaultValue={initial??''}><option value="" disabled>اختر بعد المراجعة</option>{options.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>;
}
export function TaxPolicyFields({currentPolicy,currentUserId,today}:{currentPolicy?:FinanceTaxPolicy;currentUserId?:string;today:string}) {
  const priceOptions=[['inclusive',priceBasisLabels.inclusive],['exclusive',priceBasisLabels.exclusive]] as const;
  const current=currentPolicy?.calculationPolicy?.vatControl?currentPolicy:undefined,calculation=current?.calculationPolicy,control=calculation?.vatControl;
  const [enabled,setEnabled]=useState(control?.enabled??false);
  const toggle=<label className={styles.field}>ضريبة القيمة المضافة<select name="vatEnabled" className={styles.input} value={enabled?'on':'off'} onChange={event=>setEnabled(event.target.value==='on')} required><option value="off">معطلة — دون تحصيل ضريبة</option><option value="on">تفعيل بعد تأكيد التسجيل والمراجعة</option></select></label>;
  if(!enabled)return <div className={styles.formGrid}>{toggle}
    <p className={styles.notice}>لا يلزم رقم ضريبي أو تاريخ تسجيل. الضريبة صفر على المنتجات والشحن. تُراجع بيانات الإصدار قبل بدء البيع؛ يمكنك طلب التفعيل لاحقًا.</p>
    <label className={styles.field}>اسم الجهة البائعة<input name="issuerName" className={styles.input} maxLength={200} defaultValue={current?.issuer.name} required/></label>
    <label className={styles.field}>عنوان الجهة البائعة<input name="issuerAddress" className={styles.input} maxLength={500} defaultValue={current?.issuer.address} required/></label>
    <label className={styles.field}>الموظف المسؤول عن إصدار الإيصالات<input name="automationDelegateId" className={styles.input} inputMode="numeric" pattern="[1-9][0-9]*" defaultValue={calculation?.automationDelegateId||currentUserId} required/><span className={styles.muted}>يتحقق الخادم من صلاحية إصدار الإيصالات لهذا الحساب عند الاعتماد.</span></label>
    <label className={styles.field}>بدء السريان<input name="effectiveFrom" type="date" className={styles.input} defaultValue={today} required/></label>
    <input type="hidden" name="issuerTaxNumber" value=""/><input type="hidden" name="vatPercent" value="0"/>
    <input type="hidden" name="registrationThreshold" value={(control?.registrationThresholdMinor??DEFAULT_REGISTRATION_THRESHOLD_MINOR)/100}/>
    {Object.entries({priceBasis:'exclusive',itemScope:'uniform_catalog',shippingPriceBasis:'exclusive',discountTreatment:'before_tax',rounding:'line_half_up',policyRollover:'hold_for_review',policyReference:'vat-disabled-'+today}).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}
    <p className={styles.muted}>السياسة: دون ضريبة؛ الخصم قبل الحساب، تقريب كل بند إلى هللة، وأي تغيير لاحق يوقف الإصدار للمراجعة. لا تتغير المستندات السابقة.</p>
  </div>;
  return <div className={styles.formGrid}>
    {toggle}
    <label className={styles.field}>اسم جهة الإصدار<input name="issuerName" className={styles.input} maxLength={200} defaultValue={current?.issuer.name} required/></label>
    <label className={styles.field}>الرقم الضريبي — مطلوب عند التفعيل<input name="issuerTaxNumber" className={styles.input} inputMode="numeric" pattern="3[0-9]{13}3" maxLength={15} defaultValue={current?.issuer.taxNumber}/></label>
    <label className={styles.field}>عنوان جهة الإصدار<input name="issuerAddress" className={styles.input} maxLength={500} defaultValue={current?.issuer.address} required/></label>
    <label className={styles.field}>النسبة المركزية للمنتجات والشحن (%)<input name="vatPercent" type="number" min="0" max="100" step="0.01" className={styles.input} defaultValue={current?current.vatBps/100:undefined}/><span className={styles.muted}>مطلوبة عند التفعيل. عند التعطيل تكون الضريبة المحصّلة صفرًا مهما كانت النسبة المحفوظة.</span></label>
    <label className={styles.checkbox}><input name="registrationConfirmed" type="checkbox" value="1" defaultChecked={control?.registrationConfirmed??false}/><span>أؤكد مراجعة تسجيل جهة الإصدار في ضريبة القيمة المضافة قبل طلب التفعيل.</span></label>
    <label className={styles.field}>تاريخ بدء التسجيل — مطلوب عند التفعيل<input name="registrationEffectiveFrom" type="date" className={styles.input} defaultValue={control?.registrationEffectiveFrom??undefined}/></label>
    <label className={styles.field}>حد تنبيه التسجيل (ر.س)<input name="registrationThreshold" type="number" min="0.01" step="0.01" className={styles.input} defaultValue={(control?.registrationThresholdMinor??DEFAULT_REGISTRATION_THRESHOLD_MINOR)/100} required/></label>
    <PolicySelect name="priceBasis" label="أساس أسعار المنتجات" options={priceOptions} initial={calculation?.priceBasis}/>
    <PolicySelect name="itemScope" label="نطاق ضريبة المنتجات" options={[["uniform_catalog","نسبة موحدة على جميع منتجات الكتالوج"]]} initial={calculation?.itemScope}/>
    <PolicySelect name="shippingPriceBasis" label="أساس سعر الشحن" options={priceOptions} initial={calculation?.shippingPriceBasis}/>
    <PolicySelect name="discountTreatment" label="معالجة الخصم" options={[["none","لا توجد خصومات"],["before_tax","قبل احتساب الضريبة"]]} initial={calculation?.discountTreatment}/>
    <PolicySelect name="rounding" label="طريقة التقريب" options={[["line_half_up","تقريب كل بند إلى أقرب هللة؛ النصف للأعلى"]]} initial={calculation?.rounding}/>
    <PolicySelect name="policyRollover" label="تغير السياسة بعد إنشاء الطلب" options={[["hold_for_review","إيقاف الإصدار للمراجعة عند تغير السياسة"]]} initial={calculation?.policyRollover}/>
    <label className={styles.field}>معرف الموظف المفوض بالإصدار الآلي<input name="automationDelegateId" className={styles.input} inputMode="numeric" pattern="[1-9][0-9]*" maxLength={20} defaultValue={calculation?.automationDelegateId} required/><span className={styles.muted}>أدخل بيانات حساب موظف موجود ومخول بالإصدار؛ يعيد الخادم فحص صلاحياته عند الاعتماد والإصدار.</span></label>
    <label className={styles.field}>تاريخ بدء السريان<input name="effectiveFrom" type="date" className={styles.input} defaultValue={today} required/></label>
    <label className={styles.field}>مرجع السياسة المعتمدة<input name="policyReference" className={styles.input} maxLength={160} defaultValue={current?.policyReference} required/></label>
  </div>;
}

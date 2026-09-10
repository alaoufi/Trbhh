'use client';
import { useActionState } from 'react';
import { startMfaAction, finishMfaAction, changeOwnPasswordAction, saveAuthPolicyAction, type SecurityState } from './actions';
const field = 'w-full rounded-lg border bg-background px-3 py-2';
const button = 'rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50';
function Status({ state }: { state: SecurityState }) {
  return state ? <p role={state.error ? 'alert' : 'status'} className={state.error ? 'text-destructive' : 'text-emerald-700'}>{state.error || state.notice}</p> : null;
}
export function SecurityForms({ enrolled, manager, required, minimum }: { enrolled: boolean; manager: boolean; required: boolean; minimum: number }) {
  const [start, begin, starting] = useActionState(startMfaAction, null);
  const [finish, confirm, finishing] = useActionState(finishMfaAction, null);
  const [password, change, changing] = useActionState(changeOwnPasswordAction, null);
  const [policy, save, saving] = useActionState(saveAuthPolicyAction, null);
  return <div className="space-y-8">
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-lg font-bold">{enrolled ? 'استبدال تطبيق التحقق وتجديد رموز الاسترداد' : 'ربط تطبيق التحقق'}</h2>
      <p className="text-sm text-muted-foreground">اربط تطبيق تحقق على جهازك. لا يلزم رقم جوال. احفظ رموز الاسترداد خارج جهاز التحقق لتتمكن من الدخول إذا فقدته. عند استبدال التطبيق تصبح الرموز القديمة غير صالحة.</p>
      <form action={begin} className="space-y-3">
        <label className="block">كلمة المرور الحالية<input name="currentPassword" type="password" required autoComplete="current-password" className={field} /></label>
        {enrolled && <label className="block">رمز التطبيق الحالي أو رمز استرداد<input name="factorCode" required autoComplete="one-time-code" className={field} /></label>}
        <button disabled={starting} className={button}>بدء الربط</button><Status state={start} />
      </form>
      {start?.setupKey && !finish?.recoveryCodes && <div className="space-y-3">
        <p>مفتاح الإعداد اليدوي (احفظه في تطبيق التحقق فقط):</p>
        <code dir="ltr" className="block break-all rounded bg-secondary p-3 select-all">{start.setupKey}</code>
        <form action={confirm} className="space-y-3">
          <label className="block">رمز التطبيق الجديد<input name="code" required pattern="[0-9]{6}" inputMode="numeric" autoComplete="one-time-code" className={field} /></label>
          <label className="flex gap-2"><input type="checkbox" name="saveRecovery" required /> سأحفظ رموز الاسترداد في مكان آمن عند عرضها.</label>
          <button disabled={finishing} className={button}>تأكيد الربط وعرض رموز الاسترداد</button>
        </form>
      </div>}
      <Status state={finish} />
      {finish?.recoveryCodes && <pre dir="ltr" className="select-all overflow-x-auto rounded bg-secondary p-4">{finish.recoveryCodes.join('\n')}</pre>}
    </section>
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-lg font-bold">تغيير كلمة المرور</h2>
      <p className="text-sm">الحد الأدنى {minimum} حرفاً، وبحد أقصى 72 بايت. استخدم عبارة طويلة وغير شائعة. كلمات المرور العربية تصل إلى حد البايتات بعدد أحرف أقل.</p>
      <form action={change} className="space-y-3">
        <label className="block">كلمة المرور الحالية<input name="currentPassword" type="password" required autoComplete="current-password" className={field} /></label>
        <label className="block">كلمة المرور الجديدة<input name="newPassword" type="password" required minLength={minimum} autoComplete="new-password" className={field} /></label>
        <label className="block">تأكيد كلمة المرور الجديدة<input name="confirmPassword" type="password" required minLength={minimum} autoComplete="new-password" className={field} /></label>
        <button disabled={changing} className={button}>تغيير كلمة المرور</button><Status state={password} />
      </form>
    </section>
    {manager && <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-lg font-bold">سياسة أمان الحسابات</h2>
      <p className="text-sm">الإلزام العام يبدأ بعد تجهيز جميع الإداريين. الحساب الذي ربط تطبيقه يطلب الرمز دائماً، حتى إذا أوقفت الإلزام العام.</p>
      <form action={save} className="space-y-3">
        <label className="flex gap-2"><input type="checkbox" name="requireAdminMfa" defaultChecked={required} /> إلزام جميع حسابات الإدارة بالتحقق الإضافي</label>
        <label className="block">الحد الأدنى لكلمات المرور الجديدة<input name="passwordMinimum" type="number" min={12} max={64} required defaultValue={minimum} className={field} /></label>
        <label className="block">كلمة المرور الحالية<input name="currentPassword" type="password" required autoComplete="current-password" className={field} /></label>
        <label className="block">رمز تحقق جديد أو رمز استرداد<input name="factorCode" required autoComplete="one-time-code" className={field} /></label>
        <button disabled={saving} className={button}>حفظ سياسة الأمان</button><Status state={policy} />
      </form>
    </section>}
  </div>;
}

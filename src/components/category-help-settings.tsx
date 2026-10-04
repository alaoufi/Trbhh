'use client';
import {useActionState} from 'react';
import {HELP_STEPS,type HelpSettings} from '@/lib/category-help';
import {saveHelp} from '@/app/admin/help/actions';
export function CategoryHelpSettings({settings}:{settings:HelpSettings}){
 const [state,action,pending]=useActionState(saveHelp,{message:''});
 return <details className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer font-bold">إعدادات ونصوص المساعدة</summary><form action={action} className="space-y-3"><label className="flex min-h-11 items-center gap-2"><input name="enabled" type="checkbox" value="1" defaultChecked={settings.enabled}/>إتاحة شرح الأقسام واللقطات للمسؤولين</label>{HELP_STEPS.map((s,i)=><label key={s.key} className="block text-sm">{s.title}<textarea name={s.key} defaultValue={settings.captions[i]} required maxLength={1200} rows={3} className="mt-1 w-full rounded-lg border p-2"/></label>)}<button disabled={pending} className="min-h-11 rounded-lg bg-primary px-4 text-white">{pending?'جارٍ الحفظ…':'حفظ المساعدة'}</button><p role="status">{state.message}</p></form></details>;
}

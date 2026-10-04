'use server';
import {requireAction} from '@/lib/roles';
import {isReadOnlyPreview} from '@/lib/read-only-preview';
import {setSetting} from '@/lib/settings';
import {CATEGORY_HELP_SETTING,HELP_STEPS,parseHelpSettings} from '@/lib/category-help';
import {logAdmin} from '@/lib/audit';
import {revalidatePath} from 'next/cache';
export async function saveHelp(_state:{message:string},fd:FormData){
 const actor=await requireAction('categories','edit');
 if(isReadOnlyPreview())return {message:'هذه معاينة للقراءة فقط؛ لم يُحفظ أي تعديل.'};
 try{
  const content=parseHelpSettings(JSON.stringify({enabled:fd.get('enabled')==='1',captions:HELP_STEPS.map(s=>fd.get(s.key))}),true);
  await setSetting(CATEGORY_HELP_SETTING,JSON.stringify(content));
  await logAdmin(actor.uid,'update_category_help');
  revalidatePath('/admin/help');
  return {message:'تم حفظ إعدادات المساعدة.'};
 }catch{return {message:'لم يتم الحفظ. تأكد من تعبئة جميع الخطوات وألا يتجاوز النص 1200 حرف، ثم أعد المحاولة.'};}
}

import Link from 'next/link';
import Image from 'next/image';
import {requireAnyAdmin,hasAction} from '@/lib/roles';
import {getSetting} from '@/lib/settings';
import {CATEGORY_HELP_SETTING,HELP_STEPS,parseHelpSettings} from '@/lib/category-help';
import {CategoryHelpTour} from '@/components/category-help-tour';
import {CategoryHelpSettings} from '@/components/category-help-settings';
export const dynamic='force-dynamic';
export const metadata={title:'المساعدة — إدارة الأقسام',robots:{index:false,follow:false}};
const tabs=[['guide','دليل الاستخدام'],['tour','شرح متحرك'],['shots','لقطات توضيحية']] as const;
export default async function AdminHelp({searchParams}:{searchParams:Promise<{tab?:string}>}){
 const actor=await requireAnyAdmin();
 const [query,settings,canView,canEdit]=await Promise.all([searchParams,getSetting(CATEGORY_HELP_SETTING,'').then(parseHelpSettings),hasAction(actor.uid,'categories','view'),hasAction(actor.uid,'categories','edit')]);
 const tab=tabs.some(([key])=>key===query.tab)?query.tab:'guide';
 return <div dir="rtl" className="min-w-0 space-y-4"><h1 className="text-xl font-bold">المساعدة</h1><nav aria-label="تبويبات المساعدة" className="flex flex-wrap gap-2">{tabs.map(([key,label])=><Link key={key} href={`/admin/help?tab=${key}`} aria-current={tab===key?'page':undefined} className={`min-h-11 rounded-lg border px-3 py-3 text-sm font-bold ${tab===key?'bg-primary text-white':'bg-white text-primary'}`}>{label}</Link>)}</nav>
 <Link href="/admin/guide" className="inline-block min-h-11 py-2 font-bold text-primary">دليل الإدارة الكامل ←</Link>
 {canView&&settings.enabled?<>
 <h2 className="text-lg font-bold">إدارة الأقسام وحقولها</h2>
 {tab==='guide'&&<ol className="space-y-3">{HELP_STEPS.map((s,i)=><li key={s.key} className="rounded-xl border bg-white p-4"><h3 className="font-bold">{i+1}. {s.title}</h3><p className="my-3 text-sm leading-7">{settings.captions[i]}</p><Link href={s.href} className="inline-block min-h-11 rounded-lg border px-3 py-2 text-primary">فتح {s.title}</Link></li>)}</ol>}
 {tab==='tour'&&<CategoryHelpTour captions={settings.captions}/>}
 {tab==='shots'&&<><p className="text-sm">لقطات تعليمية من مكونات الإدارة ببيانات تجريبية، وليست بيانات أعضاء أو تغييرات محفوظة. اضغط على اللقطة لتكبيرها.</p><div className="grid min-w-0 gap-4 lg:grid-cols-2">{HELP_STEPS.map((s,i)=><figure key={s.key} className="min-w-0 rounded-xl border bg-white p-3"><figcaption className="mb-2 font-bold">{i+1}. {s.title}</figcaption><a href={`/help/categories/${s.key}.webp`} target="_blank" rel="noopener noreferrer" aria-label={`تكبير لقطة ${s.title}`}><Image src={`/help/categories/${s.key}.webp`} alt={`مثال تعليمي: ${s.title}`} width={780} height={900} className="h-auto w-full rounded-lg border"/></a><p className="mt-2 text-sm leading-6">{settings.captions[i]}</p></figure>)}</div></>}
 </>:<p className="rounded-lg border p-3">شرح الأقسام غير متاح حاليًا أو لا تملك صلاحية الاطلاع عليه. يمكنك استخدام دليل الإدارة الكامل.</p>}
 {canEdit&&<CategoryHelpSettings settings={settings}/>}
 </div>;
}

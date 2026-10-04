import {GuideClassic,type GuideSection} from './guide-classic';
import {GuideBook} from './guide-book';
import {getSettingBool} from '@/lib/settings';
import {GUIDE_BOOK_SETTING,type GuideChapter} from '@/lib/guide-book';
export type {GuideSection} from './guide-classic';

export async function GuideView(props:React.ComponentProps<typeof GuideClassic>){
 if(!await getSettingBool(GUIDE_BOOK_SETTING,true))return <GuideClassic {...props}/>;
 const admin=props.topId==='admin-guide-top';
 const images:Record<string,string[]>={'category-admin-hub':['manage','ads','settings'],'field-administration':['requirements','fields'],'category-definitions':['display']};
 const imageTitles:Record<string,string>={manage:'إضافة وتعديل الأقسام',ads:'إعلانات الأقسام',settings:'إعدادات الأقسام',requirements:'إجباري واختياري',fields:'إضافة وتعديل الحقول',display:'ظهور الحقول واستخدامها'};
 const sections:GuideChapter[]=props.sections.map((s:GuideSection)=>({id:s.id,title:s.title,goal:s.goal,steps:s.steps,...(s.links?{links:s.links}:{}),...(admin&&images[s.id]?{images:images[s.id].map(key=>({src:`/help/categories/${key}.webp`,alt:`لقطة تعليمية ببيانات تجريبية — ${imageTitles[key]}`}))}:{})}));
 return <GuideBook topId={props.topId} title={props.title} subtitle={props.subtitle} sections={sections}>{props.children}</GuideBook>;
}

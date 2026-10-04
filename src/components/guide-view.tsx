import {GuideClassic,type GuideSection} from './guide-classic';
import {GuideBook} from './guide-book';
import {getSettingBool} from '@/lib/settings';
import {GUIDE_BOOK_SETTING,type GuideChapter} from '@/lib/guide-book';
export type {GuideSection} from './guide-classic';

export async function GuideView(props:React.ComponentProps<typeof GuideClassic>){
 if(!await getSettingBool(GUIDE_BOOK_SETTING,true))return <GuideClassic {...props}/>;
 const admin=props.topId==='admin-guide-top';
 const images:Record<string,string>={'category-admin-hub':'manage','field-administration':'requirements','category-definitions':'display'};
 const sections:GuideChapter[]=props.sections.map((s:GuideSection)=>({id:s.id,title:s.title,goal:s.goal,steps:s.steps,...(s.links?{links:s.links}:{}),...(admin&&images[s.id]?{images:[{src:`/help/categories/${images[s.id]}.webp`,alt:`لقطة تعليمية ببيانات تجريبية — ${s.title}`}]}:{})}));
 return <GuideBook topId={props.topId} title={props.title} subtitle={props.subtitle} sections={sections}>{props.children}</GuideBook>;
}

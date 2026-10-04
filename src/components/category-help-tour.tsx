'use client';
import {TutorialPlayer} from './tutorial-player';
import {HELP_STEPS} from '@/lib/category-help';
import Image from 'next/image';

export function CategoryHelpTour({captions}:{captions:string[]}){
 return <TutorialPlayer initialPlaying={false} shareTitle="شرح إدارة الأقسام وحقولها" ctaHref="/admin/categories" ctaLabel="فتح إدارة الأقسام" slides={HELP_STEPS.map((step,i)=>({caption:captions[i]||step.caption,body:()=> <div className="space-y-3"><p className="text-xs text-muted-foreground">مثال تعليمي — لا يغيّر بيانات الموقع</p><h2 className="rounded-lg bg-primary p-3 font-bold text-white">{i+1}. {step.title}</h2><Image unoptimized src={`/help/categories/${step.key}.webp`} alt={`مثال توضيحي: ${step.title}`} width={780} height={900} className="h-[220px] w-full rounded-lg border object-contain object-top"/><p className="rounded-lg bg-amber-50 p-2 text-sm">شاهد اللقطة كاملة في تبويب «لقطات توضيحية».</p></div>}))}/>;
}

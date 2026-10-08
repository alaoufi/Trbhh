import { GuideClassic, type GuideSection } from './guide-classic';
import { GuideBook } from './guide-book';
import { getSettingBool } from '@/lib/settings';
import { GUIDE_BOOK_SETTING, type GuideChapter } from '@/lib/guide-book';
export type { GuideSection } from './guide-classic';

/**
 * عارض الأدلة: افتراضياً «الكتاب المجسّم» ثلاثي الأبعاد الملوّن المطعّم بالصور،
 * مع إمكانية الرجوع للعرض الكلاسيكي من الإعدادات (guide_book_enabled).
 * المحتوى نفسه يأتي من صفحات الدليل فيبقى مطابقاً للواقع.
 */
export async function GuideView(props: React.ComponentProps<typeof GuideClassic>) {
  if (!(await getSettingBool(GUIDE_BOOK_SETTING, true).catch(() => true))) return <GuideClassic {...props} />;
  const admin = props.topId === 'admin-guide-top';
  // لقطات الأقسام والحقول تُطعّم قسم «إدارة الأقسام والحقول» في دليل الإدارة.
  const images: Record<string, string[]> = { 'category-definitions': ['manage', 'fields', 'requirements', 'display', 'ads', 'settings'] };
  const imageTitles: Record<string, string> = { manage: 'إضافة وتعديل الأقسام', fields: 'إضافة وتعديل الحقول', requirements: 'الحقول الإجبارية والاختيارية', display: 'إظهار وإخفاء الحقول', ads: 'إعلانات الأقسام', settings: 'إعدادات الأقسام' };
  const sections: GuideChapter[] = props.sections.map((s: GuideSection) => ({
    id: s.id, title: s.title, goal: s.goal, steps: s.steps,
    ...(s.links ? { links: s.links } : {}),
    ...(admin && images[s.id] ? { images: images[s.id].map((key) => ({ src: `/help/categories/${key}.webp`, alt: `لقطة تعليمية ببيانات تجريبية — ${imageTitles[key]}` })) } : {}),
  }));
  return <GuideBook topId={props.topId} title={props.title} subtitle={props.subtitle} sections={sections}>{props.children}</GuideBook>;
}

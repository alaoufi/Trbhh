import { PlusCircle, Store, HandCoins, ShieldCheck, Crown, Rocket } from 'lucide-react';

/** تعريف الشروحات المتحركة — تُعرض في صفحة الشروحات وقائمة الموقع. */
export const TUTORIALS = [
  { slug: 'add-ad', title: 'إضافة إعلان', desc: 'من زر «أضف إعلان» حتى ظهور إعلانك ومتابعة مشاهداته.', icon: PlusCircle, from: '#0ea5e9', to: '#0369a1' },
  { slug: 'ad-boost', title: 'مميزات تزيد في تسويق إعلانك', desc: 'التمييز ⭐ وشارة عاجل 🔥 والتحديث ⬆ وأكثر — شكل كل ميزة وكيف تفعّلها.', icon: Rocket, from: '#e11d48', to: '#9f1239' },
  { slug: 'open-store', title: 'إنشاء متجر', desc: 'فتح متجرك المستقل بتجربة مجانية: الهوية والتصميم والمنتجات.', icon: Store, from: '#0d9488', to: '#115e59' },
  { slug: 'topup', title: 'شحن الرصيد', desc: 'التحويل البنكي وإرفاق الإيصال حتى إضافة المبلغ لرصيدك.', icon: HandCoins, from: '#16a34a', to: '#166534' },
  { slug: 'verify', title: 'توثيق الحساب', desc: 'رفع الوثائق والحصول على شارة «موثّق» التي تزيد ثقة العملاء.', icon: ShieldCheck, from: '#10b981', to: '#047857' },
  { slug: 'feature-ad', title: 'تمييز الإعلان', desc: 'إبراز إعلانك بإطار مميّز في مقدمة القوائم مقابل رصيدك.', icon: Crown, from: '#f59e0b', to: '#b45309' },
] as const;
export type TutorialSlug = typeof TUTORIALS[number]['slug'];

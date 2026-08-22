import {
  LayoutDashboard, Users, Megaphone, Flag, ShieldCheck, Copy, Sparkles, Ban,
  Crown, Settings, MonitorPlay, BookOpen, ShieldAlert, DatabaseBackup, KeyRound, MessageSquare, Coins,
  Store, MessagesSquare, FileText, Shield, HandCoins, ScrollText, BellRing, Search as SearchIcon, Link2 as LinkIcon,
   Archive, AlertTriangle, CreditCard, WalletCards, Landmark,
} from 'lucide-react';
import type { Perm } from '@/lib/roles';

export type AdminNavItem = { href: string; label: string; icon: React.ElementType; perm: Perm | null; description?: string; keywords?: string[] };
export type AdminNavGroup = { key: string; title: string; icon: React.ElementType; color: string; items: AdminNavItem[] };

/**
 * قائمة لوحة الإدارة مجمّعة: المتشابهات في قائمة فرعية، ولكل تصنيف لون مميّز.
 * مشتركة بين تخطيط الإدارة وقائمة الهيدر (الثلاث شرطات).
 */
export const ADMIN_GROUPS: AdminNavGroup[] = [
  {
    key: 'top', title: '', icon: LayoutDashboard, color: '#3287da',
    items: [
      { href: '/admin', label: 'لوحة الإدارة', icon: LayoutDashboard, perm: null },
      { href: '/admin/search', label: 'بحث الإدارة', icon: SearchIcon, perm: null },
      { href: '/admin/archive', label: 'الأرشيف', icon: Archive, perm: null },
      { href: '/admin/guide', label: 'دليل الإدارة', icon: BookOpen, perm: null },
    ],
  },
  {
    key: 'members', title: 'الأعضاء والصلاحيات', icon: Users, color: '#6366f1',
    items: [
      { href: '/admin/users', label: 'الأعضاء', icon: Users, perm: 'users' },
      { href: '/admin/roles', label: 'الأدوار والصلاحيات', icon: KeyRound, perm: 'users' },
      { href: '/admin/links', label: 'ربط الأعضاء', icon: LinkIcon, perm: 'users' },
      { href: '/admin/verifications', label: 'طلبات التوثيق', icon: ShieldCheck, perm: 'verifications' },
      { href: '/admin/international-registrations', label: 'طلبات التسجيل الدولي', icon: Shield, perm: 'users', description: 'مراجعة التسجيلات من خارج المملكة', keywords: ['تسجيل دولي', 'دولة', 'رقم دولي'] },
    ],
  },
  {
    key: 'content', title: 'الإعلانات والمحتوى', icon: Megaphone, color: '#0ea5e9',
    items: [
      { href: '/admin/ads', label: 'الإعلانات', icon: Megaphone, perm: 'ads' },
      { href: '/admin/duplicates', label: 'الإعلانات المكررة', icon: Copy, perm: 'duplicates' },
      { href: '/admin/classified', label: 'الإعلانات المبوّبة', icon: Sparkles, perm: 'classified' },
      { href: '/admin/promos', label: 'الإعلانات الترويجية', icon: MonitorPlay, perm: 'promos', description: 'مراجعة ونشر الإعلانات المدفوعة', keywords: ['ترويج', 'إعلان مدفوع', 'بانر عضو'] },
    ],
  },
  {
    key: 'stores', title: 'المتاجر', icon: Store, color: '#0d9488',
    items: [
      { href: '/admin/stores', label: 'إدارة المتاجر', icon: Store, perm: 'stores' },
    ],
  },
  {
    key: 'safety', title: 'الحماية والمخالفات', icon: Shield, color: '#dc2626',
    items: [
      { href: '/admin/reports', label: 'البلاغات (أعضاء ورصد آلي)', icon: Flag, perm: 'reports' },
      { href: '/admin/words', label: 'الكلمات المرفوضة', icon: Ban, perm: 'words' },
      { href: '/admin/guard-words', label: 'كلمات حارس المحتوى', icon: ShieldAlert, perm: 'words' },
      { href: '/admin/messages', label: 'مراقبة المراسلات', icon: MessagesSquare, perm: 'messages' },
      { href: '/admin/notifs', label: 'تنبيهات الأعضاء', icon: BellRing, perm: 'messages' },
    ],
  },
  {
    key: 'money', title: 'المال والاشتراكات', icon: Coins, color: '#16a34a',
    items: [
      { href: '/admin/revenue', label: 'الميزانية والتقارير المالية', icon: Coins, perm: 'users', description: 'ملخص الدخل والمصروف والميزانية', keywords: ['إيرادات', 'تقرير مالي', 'ميزانية'] },
      { href: '/admin/revenue?tab=wallets', label: 'محافظ الأعضاء', icon: WalletCards, perm: 'users', description: 'البحث في محافظ الأعضاء وسجل تعاملاتهم', keywords: ['محفظة عضو', 'رصيد عضو', 'سجل مالي'] },
      { href: '/admin/revenue?tab=accounts', label: 'حسابات الشحن البنكية', icon: Landmark, perm: 'users', description: 'البنوك والآيبان التي يحوّل إليها الأعضاء', keywords: ['الحساب البنكي', 'آيبان', 'بيانات التحويل', 'بنك', 'حساب الشحن'] },
      { href: '/admin/topups', label: 'طلبات شحن الرصيد', icon: HandCoins, perm: 'users', description: 'طلبات الشحن البنكي وإيصالاتها', keywords: ['شحن', 'إيصال', 'تحويل بنكي'] },
      { href: '/admin/payments', label: 'وسائل الدفع الإلكتروني', icon: CreditCard, perm: 'users', description: 'إعداد بوابات الدفع', keywords: ['دفع', 'بطاقة', 'مدى', 'بوابة دفع'] },
      { href: '/admin/revenue?tab=pricing', label: 'التسعير والباقات', icon: Crown, perm: 'users', description: 'أسعار الخدمات والاشتراكات والباقات', keywords: ['سعر', 'باقة', 'رسوم خدمة'] },
      { href: '/admin/revenue?tab=campaigns', label: 'حملات ومكافآت الشحن', icon: HandCoins, perm: 'users', description: 'عروض زيادة الرصيد والحملات المجدولة', keywords: ['مكافأة', 'عرض شحن', 'حملة شحن'] },
      { href: '/admin/revenue?tab=expenses', label: 'مصروفات المنصة', icon: Coins, perm: 'users', description: 'تسجيل ومراجعة المصروفات', keywords: ['مصروف', 'تكلفة', 'نفقة'] },
    ],
  },
  {
    key: 'system', title: 'النظام والإعدادات', icon: Settings, color: '#64748b',
    items: [
      { href: '/admin/texts', label: 'النصوص الظاهرة', icon: FileText, perm: 'users' },
      { href: '/admin/verification', label: 'بوابات التحقق (SMS/واتساب)', icon: MessageSquare, perm: 'users' },
      { href: '/admin/settings', label: 'الإعدادات', icon: Settings, perm: 'users' },
      { href: '/admin/audit', label: 'سجل نشاط الإدارة', icon: ScrollText, perm: 'users' },
      { href: '/admin/errors', label: 'سجل الأخطاء التقنية', icon: AlertTriangle, perm: 'users' },
      { href: '/admin/backup', label: 'نسخ احتياطي واستعادة', icon: DatabaseBackup, perm: 'backup' },
    ],
  },
];

/** القائمة المسطّحة (للتوافق: فلترة الصلاحيات وغيرها). */
export const ADMIN_NAV: AdminNavItem[] = ADMIN_GROUPS.flatMap((g) => g.items);

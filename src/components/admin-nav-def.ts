import {
  LayoutDashboard, Users, Megaphone, LayoutGrid, Flag, ShieldCheck, Copy, Sparkles, Ban,
  Crown, Settings, MonitorPlay, BookOpen, ShieldAlert, DatabaseBackup, KeyRound, MessageSquare, Coins,
} from 'lucide-react';
import type { Perm } from '@/lib/roles';

/** تعريف قائمة لوحة الإدارة — مشترك بين تخطيط الإدارة وقائمة الهيدر (الثلاث شرطات). */
export const ADMIN_NAV: { href: string; label: string; icon: React.ElementType; perm: Perm | null }[] = [
  { href: '/admin', label: 'لوحة الإدارة', icon: LayoutDashboard, perm: null },
  { href: '/admin/guide', label: 'دليل الإدارة', icon: BookOpen, perm: null },
  { href: '/admin/users', label: 'المستخدمون', icon: Users, perm: 'users' },
  { href: '/admin/roles', label: 'الأدوار والصلاحيات', icon: KeyRound, perm: 'users' },
  { href: '/admin/ads', label: 'الإعلانات', icon: Megaphone, perm: 'ads' },
  { href: '/admin/duplicates', label: 'الإعلانات المكررة', icon: Copy, perm: 'duplicates' },
  { href: '/admin/classified', label: 'الإعلانات المبوّبة', icon: Sparkles, perm: 'classified' },
  { href: '/admin/categories', label: 'الأقسام', icon: LayoutGrid, perm: 'categories' },
  { href: '/admin/words', label: 'الكلمات المرفوضة', icon: Ban, perm: 'words' },
  { href: '/admin/guard-words', label: 'كلمات حارس المحتوى', icon: ShieldAlert, perm: 'words' },
  { href: '/admin/reports', label: 'البلاغات', icon: Flag, perm: 'reports' },
  { href: '/admin/verifications', label: 'طلبات التوثيق', icon: ShieldCheck, perm: 'verifications' },
  { href: '/admin/revenue', label: 'الإيرادات والتسعير', icon: Coins, perm: 'users' },
  { href: '/admin/packages', label: 'الباقات', icon: Crown, perm: 'packages' },
  { href: '/admin/promos', label: 'الإعلانات الترويجية', icon: MonitorPlay, perm: 'promos' },
  { href: '/admin/verification', label: 'بوابات التحقق (SMS/واتساب)', icon: MessageSquare, perm: 'users' },
  { href: '/admin/texts', label: 'النصوص الظاهرة', icon: MessageSquare, perm: 'users' },
  { href: '/admin/settings', label: 'الإعدادات', icon: Settings, perm: 'users' },
  { href: '/admin/backup', label: 'نسخ احتياطي واستعادة', icon: DatabaseBackup, perm: 'backup' },
];

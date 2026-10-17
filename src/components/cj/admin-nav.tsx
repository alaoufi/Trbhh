'use client';
import {useAdminNavigationAccess} from '@/components/admin-navigation-access';
import Link from 'next/link';
import {ADMIN_NAV,ADMIN_GROUPS} from '@/components/admin-nav-def';

/**
 * شريط تنقّل موحّد لصفحات إدارة المورد — يظهر أعلى كل صفحة ليسهُل الانتقال بينها.
 * التبويب الحالي مميّز. روابط ثابتة فقط (بلا حالة) لتبقى قابلة للتصيير على الخادم.
 */
const TABS: { key: string; href: string; label: string }[] = [
  { key: 'browse', href: '/admin/suppliers/cj/browse', label: 'تصفّح واستيراد' },
  { key: 'imported', href: '/admin/suppliers/cj/imported', label: 'البضائع المستوردة' },
  { key: 'showcase', href: '/admin/suppliers/cj/showcase', label: 'السلع المعروضة' },
  {key:'purchases',href:'/admin/suppliers/cj/purchases',label:'شراء العميل والإرسال إلى المورد'},
  { key: 'payables', href: '/admin/suppliers/cj/payables', label: 'سداد مستحقات المورد' },
  {key:'preparation',href:'/admin/suppliers/cj/preparation',label:'تأكيد سداد المورد والتجهيز'},
  {key:'tracking',href:'/admin/suppliers/cj/tracking',label:'شحن المورد والتتبع والاستلام'},
  {key:'history',href:'/admin/suppliers/cj/history',label:'سجل المورد المغلق والحسابات'},
  { key: 'orders', href: '/admin/suppliers/cj/orders', label: 'الطلبات' },
  { key: 'agents', href: '/admin/suppliers/cj/agents', label: 'الوكلاء' },
  { key: 'glossary', href: '/admin/suppliers/cj/glossary', label: 'مُسرد الترجمة' },
  { key: 'settings', href: '/admin/suppliers/cj', label: 'الإعدادات والاختبار' },
];

export function CjAdminNav({ current }: { current: 'purchases' | 'preparation' | 'tracking' | 'history' | 'browse' | 'imported' | 'showcase' | 'orders' | 'payables' | 'agents' | 'glossary' | 'settings' }) {
  const allowed=new Set(useAdminNavigationAccess());
  const currentHref=TABS.find(tab=>tab.key===current)?.href;
  const group=ADMIN_GROUPS.find(g=>g.items.some(i=>i.href===currentHref));
  const related=new Set(group?.items.map(i=>i.href));
  return (
    <nav aria-label="إدارة المورد" className="-mx-1 flex flex-wrap gap-1.5 border-b border-primary/15 pb-2">
      {TABS.filter(tab=>allowed.has(tab.href)&&related.has(tab.href)).map(tab => {
        const active = tab.key === current;
        return (
          <Link key={tab.key} href={tab.href} aria-current={active ? 'page' : undefined}
            className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-bold ${active ? 'bg-primary text-white' : 'border border-primary/25 text-primary hover:bg-primary/5'}`}>
            {ADMIN_NAV.find(item=>item.href===tab.href)?.label??tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

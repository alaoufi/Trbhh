import Link from 'next/link';

/**
 * شريط تنقّل موحّد لصفحات إدارة CJ — يظهر أعلى كل صفحة ليسهُل الانتقال بينها.
 * التبويب الحالي مميّز. روابط ثابتة فقط (بلا حالة) لتبقى قابلة للتصيير على الخادم.
 */
const TABS: { key: string; href: string; label: string }[] = [
  { key: 'browse', href: '/admin/suppliers/cj/browse', label: 'المنتجات والمعالجة' },
  { key: 'showcase', href: '/admin/suppliers/cj/showcase', label: 'السلع المعروضة' },
  { key: 'orders', href: '/admin/suppliers/cj/orders', label: 'الطلبات' },
  { key: 'agents', href: '/admin/suppliers/cj/agents', label: 'الوكلاء' },
  { key: 'settings', href: '/admin/suppliers/cj', label: 'الإعدادات والاختبار' },
];

export function CjAdminNav({ current }: { current: 'browse' | 'showcase' | 'orders' | 'agents' | 'settings' }) {
  return (
    <nav aria-label="إدارة CJ" className="-mx-1 flex flex-wrap gap-1.5 border-b border-primary/15 pb-2">
      {TABS.map(tab => {
        const active = tab.key === current;
        return (
          <Link key={tab.key} href={tab.href} aria-current={active ? 'page' : undefined}
            className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-bold ${active ? 'bg-primary text-white' : 'border border-primary/25 text-primary hover:bg-primary/5'}`}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

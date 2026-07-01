import Link from 'next/link';

type Cat = { id: number; name: string };

export function CategoryTabs({ categories, activeId }: { categories: Cat[]; activeId?: number }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
      <Tab href="/" label="الكل" active={!activeId} />
      <Tab href="/search?special=1" label="جديد" highlight />
      {categories.map((c) => (
        <Tab key={c.id} href={`/categories/${c.id}`} label={c.name} active={activeId === c.id} />
      ))}
    </div>
  );
}

function Tab({ href, label, active, highlight }: { href: string; label: string; active?: boolean; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className={[
        'shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
        highlight
          ? 'border-transparent bg-[hsl(var(--new))] text-white'
          : active
            ? 'border-primary bg-primary text-white'
            : 'border-primary/40 bg-white text-primary hover:bg-accent',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}

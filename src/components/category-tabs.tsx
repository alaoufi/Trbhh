import Link from 'next/link';

type Cat = { id: number; name: string };

export function CategoryTabs({ categories, activeId }: { categories: Cat[]; activeId?: number }) {
  return (
    <div className="-mx-4 border-y border-primary/20 bg-[hsl(var(--card))] px-4 py-2 shadow-sm">
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        <Tab href="/" label="الكل" active={!activeId} />
        <Tab href="/search?special=1" label="جديد" highlight />
        {categories.map((c) => (
          <Tab key={c.id} href={`/categories/${c.id}`} label={c.name} active={activeId === c.id} />
        ))}
      </div>
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

import Link from 'next/link';
import Image from 'next/image';

type Cat = { id: number; name: string; icon: string };

export function CategoryGrid({ categories }: { categories: Cat[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/categories/${c.id}`}
          className="flex flex-col items-center gap-2 rounded-xl border bg-card p-3 text-center shadow-sm transition-colors hover:border-primary hover:bg-accent"
        >
          <div className="relative h-12 w-12 overflow-hidden">
            <Image src={c.icon} alt={c.name} fill sizes="48px" className="object-contain" />
          </div>
          <span className="line-clamp-2 text-xs font-medium leading-4">{c.name}</span>
        </Link>
      ))}
    </div>
  );
}

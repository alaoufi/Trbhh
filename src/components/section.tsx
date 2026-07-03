import Link from 'next/link';

export function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-primary">
          <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-primary to-[hsl(var(--primary)/0.55)]" />
          {title}
        </h2>
        {href && (
          <Link href={href} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary transition hover:bg-primary/20">
            عرض الكل
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

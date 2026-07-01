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
        <h2 className="text-lg font-bold">{title}</h2>
        {href && (
          <Link href={href} className="text-sm text-primary hover:underline">
            عرض الكل
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

import { ChevronDown } from 'lucide-react';

/**
 * تبويب إداري قابل للطي/التمدد — يستخدم <details> الأصلية فتبقى كل الحقول في DOM
 * وتُرسَل مع النموذج حتى وهو مطويّ (بخلاف الطيّ الذي يزيل العناصر). خفيف بلا JS.
 */
export function Collapse({
  summary,
  children,
  open = false,
  className = '',
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  className?: string;
}) {
  return (
    <details open={open} className={`group rounded-xl border border-primary/20 [&_summary::-webkit-details-marker]:hidden ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-bold">
        <span className="flex min-w-0 flex-wrap items-center gap-2">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-primary/10 p-3">{children}</div>
    </details>
  );
}

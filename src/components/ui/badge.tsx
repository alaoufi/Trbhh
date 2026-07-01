import { cn } from '@/lib/utils';

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: 'default' | 'special' | 'trusted' | 'muted' }) {
  const variants = {
    default: 'bg-secondary text-secondary-foreground',
    special: 'bg-amber-100 text-amber-800',
    trusted: 'bg-accent text-accent-foreground',
    muted: 'bg-muted text-muted-foreground',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

import { ShieldAlert } from 'lucide-react';
import { getDisclaimer } from '@/lib/settings';
import { cn } from '@/lib/utils';

export async function DisclaimerBar({ variant = 'inline', className }: { variant?: 'inline' | 'full'; className?: string }) {
  const d = await getDisclaimer();
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900',
        className,
      )}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-xs leading-5">{variant === 'full' ? d.long : d.short}</p>
    </div>
  );
}

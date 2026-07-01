import { ShieldAlert } from 'lucide-react';
import { DISCLAIMER } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function DisclaimerBar({ variant = 'inline', className }: { variant?: 'inline' | 'full'; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900',
        className,
      )}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-xs leading-5">{variant === 'full' ? DISCLAIMER.long : DISCLAIMER.short}</p>
    </div>
  );
}

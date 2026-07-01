import { Heart } from 'lucide-react';
import { toggleFavoriteAction } from '@/app/account/actions';
import { cn } from '@/lib/utils';

export function FavoriteButton({ adId, active, disabled, compact }: { adId: number; active: boolean; disabled?: boolean; compact?: boolean }) {
  if (compact) {
    if (disabled) {
      return (
        <a href="/login" className="flex flex-col items-center gap-1 text-sm font-medium text-primary">
          <Heart className="h-5 w-5" /> المفضلة
        </a>
      );
    }
    return (
      <form action={toggleFavoriteAction} className="contents">
        <input type="hidden" name="adId" value={adId} />
        <button className="flex flex-col items-center gap-1 text-sm font-medium text-primary">
          <Heart className={cn('h-5 w-5', active && 'fill-red-500 text-red-500')} /> المفضلة
        </button>
      </form>
    );
  }
  if (disabled) {
    return (
      <a href="/login" className="flex h-10 items-center justify-center gap-2 rounded-lg border text-sm hover:bg-secondary">
        <Heart className="h-4 w-4" /> أضف للمفضلة
      </a>
    );
  }
  return (
    <form action={toggleFavoriteAction} className="contents">
      <input type="hidden" name="adId" value={adId} />
      <button className={cn('flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm hover:bg-secondary', active && 'border-destructive/40 bg-destructive/5 text-destructive')}>
        <Heart className={cn('h-4 w-4', active && 'fill-current')} /> {active ? 'في المفضلة' : 'أضف للمفضلة'}
      </button>
    </form>
  );
}

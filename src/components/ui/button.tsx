import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-b from-primary to-[hsl(var(--primary)/0.82)] text-primary-foreground shadow-[0_4px_12px_-2px_hsl(var(--primary)/0.45)] hover:brightness-110',
        outline: 'border-2 border-primary/30 bg-card shadow-sm hover:border-primary/50 hover:bg-secondary',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-secondary',
        whatsapp: 'bg-gradient-to-b from-[#25D366] to-[#1fb959] text-white shadow-[0_4px_12px_-2px_rgba(37,211,102,0.5)] hover:brightness-110',
        destructive: 'bg-gradient-to-b from-destructive to-[hsl(var(--destructive)/0.82)] text-destructive-foreground shadow-[0_4px_12px_-2px_hsl(var(--destructive)/0.45)] hover:brightness-110',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = 'Button';
export { buttonVariants };

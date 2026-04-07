import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600',
        secondary:
          'border-transparent bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100',
        destructive:
          'border-transparent bg-red-500 text-white hover:bg-red-600 dark:bg-red-600',
        outline:
          'text-neutral-900 dark:text-neutral-100',
        bullish:
          'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
        bearish:
          'border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        neutral:
          'border-transparent bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

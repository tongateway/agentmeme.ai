import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
        secondary: 'border-transparent bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300',
        destructive: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
        outline: 'border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300',
        success: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
        warning: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        bullish: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
        bearish: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
        neutral: 'border-transparent bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';

type BentoItem = {
  title: string;
  description: string;
  icon: ReactNode;
  className?: string;
};

type BentoGridProps = {
  items: BentoItem[];
  className?: string;
};

export function BentoGrid({ items, className }: BentoGridProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-3', className)}>
      {items.map((item, i) => (
        <motion.div
          key={item.title}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.1, duration: 0.5, ease: 'easeOut' }}
          className={cn(
            'group relative overflow-hidden rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-neutral-700 hover:bg-neutral-900/80',
            item.className,
          )}
        >
          {/* Hover gradient */}
          <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            style={{ background: 'radial-gradient(300px circle at 50% 0%, rgba(99,102,241,0.08), transparent 70%)' }}
          />

          <div className="relative z-10 flex h-full flex-col gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-800 text-neutral-300">
              {item.icon}
            </div>
            <h3 className="text-base font-semibold text-white">{item.title}</h3>
            <p className="text-sm leading-relaxed text-gray-400">{item.description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

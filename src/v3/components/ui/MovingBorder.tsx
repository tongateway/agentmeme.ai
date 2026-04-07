import { useRef, type ReactNode } from 'react';
import { motion, useAnimationFrame, useMotionTemplate, useMotionValue, useTransform } from 'framer-motion';
import { cn } from '../../utils/cn';

type MovingBorderProps = {
  children: ReactNode;
  className?: string;
  borderClassName?: string;
  duration?: number;
  onClick?: () => void;
};

export function MovingBorder({
  children,
  className,
  borderClassName,
  duration = 2400,
  onClick,
}: MovingBorderProps) {
  const pathRef = useRef<SVGRectElement>(null);
  const progress = useMotionValue(0);

  useAnimationFrame((time) => {
    const length = pathRef.current?.getTotalLength?.() ?? 0;
    if (length) {
      const pct = (time % duration) / duration;
      progress.set(pct * length);
    }
  });

  const x = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val)?.x ?? 0);
  const y = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val)?.y ?? 0);
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative inline-flex h-11 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-gray-950 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-900',
        className,
      )}
    >
      {/* Animated border glow */}
      <div className="absolute inset-0 overflow-hidden rounded-xl">
        <svg
          className="absolute inset-0"
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            ref={pathRef}
            fill="none"
            width="100%"
            height="100%"
            rx="11"
            ry="11"
          />
        </svg>
        <motion.div
          style={{ transform }}
          className={cn(
            'absolute h-16 w-16 opacity-80',
            borderClassName,
          )}
        >
          <div
            className="h-full w-full rounded-full opacity-80 blur-md"
            style={{ background: 'radial-gradient(circle, #00C389 0%, transparent 70%)' }}
          />
        </motion.div>
      </div>

      {/* Border ring */}
      <div className="absolute inset-[1px] rounded-[10px] bg-gray-950/90" />

      <span className="relative z-10">{children}</span>
    </button>
  );
}

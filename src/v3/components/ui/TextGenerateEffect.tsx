import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../utils/cn';

type TextGenerateEffectProps = {
  words: string;
  className?: string;
  wordClassName?: string;
  duration?: number;
};

export function TextGenerateEffect({
  words,
  className,
  wordClassName,
  duration = 0.08,
}: TextGenerateEffectProps) {
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRendered(true), 50);
    return () => clearTimeout(t);
  }, []);

  const wordArray = words.split(' ');

  return (
    <span className={cn('inline', className)}>
      <AnimatePresence>
        {wordArray.map((word, i) => (
          <motion.span
            key={`${word}-${i}`}
            initial={{ opacity: 0, filter: 'blur(8px)', y: 8 }}
            animate={rendered ? { opacity: 1, filter: 'blur(0px)', y: 0 } : {}}
            transition={{
              delay: i * duration,
              duration: 0.4,
              ease: 'easeOut',
            }}
            className={cn('inline-block mr-[0.25em]', wordClassName)}
          >
            {word}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

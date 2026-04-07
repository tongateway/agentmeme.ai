import { cn } from '../../utils/cn';

type BackgroundBeamsProps = {
  className?: string;
};

export function BackgroundBeams({ className }: BackgroundBeamsProps) {
  const beams = [
    { x1: '20%', y1: '0%', x2: '60%', y2: '100%', delay: 0 },
    { x1: '40%', y1: '0%', x2: '10%', y2: '100%', delay: 0.5 },
    { x1: '60%', y1: '0%', x2: '90%', y2: '100%', delay: 1.0 },
    { x1: '80%', y1: '0%', x2: '30%', y2: '100%', delay: 1.5 },
    { x1: '10%', y1: '0%', x2: '70%', y2: '100%', delay: 0.8 },
    { x1: '90%', y1: '0%', x2: '40%', y2: '100%', delay: 1.2 },
  ];

  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          {beams.map((_, i) => (
            <linearGradient key={i} id={`beam-grad-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#00C389" stopOpacity="0" />
              <stop offset="50%" stopColor="#00C389" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00C389" stopOpacity="0" />
            </linearGradient>
          ))}
          {beams.map((_, i) => (
            <linearGradient key={`h-${i}`} id={`beam-h-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00C389" stopOpacity="0" />
              <stop offset="50%" stopColor="#00C389" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#00C389" stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {beams.map((beam, i) => (
          <line
            key={i}
            x1={beam.x1}
            y1={beam.y1}
            x2={beam.x2}
            y2={beam.y2}
            stroke={`url(#beam-grad-${i})`}
            strokeWidth="1"
            opacity="0.6"
            style={{
              animation: `beam-fade ${3 + i * 0.4}s ease-in-out ${beam.delay}s infinite alternate`,
            }}
          />
        ))}
      </svg>

      {/* Radial glow at center-bottom */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[400px] w-[600px] rounded-full opacity-10"
        style={{
          background: 'radial-gradient(ellipse at center, #00C389 0%, transparent 70%)',
        }}
      />

      <style>{`
        @keyframes beam-fade {
          from { opacity: 0.2; }
          to   { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

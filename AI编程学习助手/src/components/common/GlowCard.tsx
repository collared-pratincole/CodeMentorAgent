import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlowCardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  accent?: 'accent' | 'green' | 'purple' | 'amber';
}

const accentColors = {
  accent: {
    border: 'hover:border-l-cm-accent',
  },
  green: {
    border: 'hover:border-l-cm-green',
  },
  purple: {
    border: 'hover:border-l-cm-purple',
  },
  amber: {
    border: 'hover:border-l-cm-amber',
  },
};

export default function GlowCard({
  title,
  children,
  className,
  accent = 'accent',
}: GlowCardProps) {
  const accentStyle = accentColors[accent];

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-2xl border border-cm-border border-l-4 border-l-transparent bg-cm-card p-5 shadow-soft transition-all duration-300',
        'hover:shadow-soft-md',
        accentStyle.border,
        className
      )}
    >
      {title && (
        <h3 className="mb-3 text-base font-semibold text-cm-text font-display">{title}</h3>
      )}
      {children}
    </motion.div>
  );
}

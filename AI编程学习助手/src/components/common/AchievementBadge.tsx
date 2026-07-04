import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AchievementBadgeProps {
  name: string;
  icon: string;
  description: string;
  earned: boolean;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

const rarityColors = {
  common: {
    border: 'border-cm-border',
    bg: 'bg-cm-card-alt',
    text: 'text-cm-muted',
    badge: 'bg-cm-card-alt text-cm-muted',
  },
  rare: {
    border: 'border-cm-blue',
    bg: 'bg-cm-blue-light',
    text: 'text-cm-blue',
    badge: 'bg-cm-blue-light text-cm-blue',
  },
  epic: {
    border: 'border-cm-purple',
    bg: 'bg-cm-purple-light',
    text: 'text-cm-purple',
    badge: 'bg-cm-purple-light text-cm-purple',
  },
  legendary: {
    border: 'border-cm-accent',
    bg: 'bg-cm-accent-light',
    text: 'text-cm-accent',
    badge: 'bg-cm-accent-light text-cm-accent',
  },
};

const rarityLabels = {
  common: '普通',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
};

export default function AchievementBadge({
  name,
  icon,
  description,
  earned,
  rarity,
}: AchievementBadgeProps) {
  const style = rarityColors[rarity];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, type: 'spring', stiffness: 200 }}
      className="group relative"
    >
      <div
        className={cn(
          'flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all duration-300',
          earned ? [style.border, style.bg] : 'border-cm-border-light bg-cm-card',
          !earned && 'opacity-40 grayscale'
        )}
      >
        <span className={cn('text-3xl', !earned && 'grayscale')}>{icon}</span>
        <span
          className={cn(
            'text-xs font-medium',
            earned ? 'text-cm-text' : 'text-cm-muted'
          )}
        >
          {name}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-medium',
            earned ? style.badge : 'bg-cm-card-alt text-cm-muted'
          )}
        >
          {rarityLabels[rarity]}
        </span>
      </div>

      {/* Tooltip */}
      <div
        className={cn(
          'pointer-events-none absolute -top-12 left-1/2 z-10 -translate-x-1/2',
          'rounded-lg bg-cm-surface border border-cm-border px-3 py-1.5 text-xs text-cm-text whitespace-nowrap',
          'opacity-0 shadow-soft-md transition-opacity group-hover:opacity-100'
        )}
      >
        {description}
        <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-cm-border bg-cm-surface" />
      </div>
    </motion.div>
  );
}

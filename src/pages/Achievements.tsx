import { motion } from 'framer-motion';
import { Trophy, ArrowLeft, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLearningStore } from '@/stores/useLearningStore';
import { cn } from '@/lib/utils';

interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  condition: (state: { completedDays: number[]; streak: number; totalXP: number }) => boolean;
  progress: (state: { completedDays: number[]; streak: number; totalXP: number }) => number;
  target: number;
  unit: string;
}

const achievements: AchievementDef[] = [
  {
    id: 'first-day',
    name: '初出茅庐',
    icon: '🎯',
    description: '完成第一天学习',
    rarity: 'common',
    condition: ({ completedDays }) => completedDays.length >= 1,
    progress: ({ completedDays }) => Math.min(completedDays.length, 1),
    target: 1,
    unit: '天',
  },
  {
    id: 'streak-7',
    name: '连续七天',
    icon: '🔥',
    description: '连续学习7天',
    rarity: 'rare',
    condition: ({ streak }) => streak >= 7,
    progress: ({ streak }) => Math.min(streak, 7),
    target: 7,
    unit: '天',
  },
  {
    id: 'explorer',
    name: '知识探索者',
    icon: '📚',
    description: '完成10节课程',
    rarity: 'rare',
    condition: ({ completedDays }) => completedDays.length >= 10,
    progress: ({ completedDays }) => Math.min(completedDays.length, 10),
    target: 10,
    unit: '节',
  },
  {
    id: 'code-master',
    name: '代码大师',
    icon: '💎',
    description: '累计获得1000经验值',
    rarity: 'epic',
    condition: ({ totalXP }) => totalXP >= 1000,
    progress: ({ totalXP }) => Math.min(totalXP, 1000),
    target: 1000,
    unit: 'XP',
  },
  {
    id: 'monthly',
    name: '月度坚持',
    icon: '🌙',
    description: '完成30天学习',
    rarity: 'epic',
    condition: ({ completedDays }) => completedDays.length >= 30,
    progress: ({ completedDays }) => Math.min(completedDays.length, 30),
    target: 30,
    unit: '天',
  },
  {
    id: 'habit',
    name: '习惯养成',
    icon: '⚡',
    description: '连续学习30天',
    rarity: 'legendary',
    condition: ({ streak }) => streak >= 30,
    progress: ({ streak }) => Math.min(streak, 30),
    target: 30,
    unit: '天',
  },
];

const rarityConfig = {
  common: { label: '普通', color: 'text-cm-muted', bg: 'bg-cm-card-alt', border: 'border-cm-border' },
  rare: { label: '稀有', color: 'text-cm-blue', bg: 'bg-cm-blue-light', border: 'border-cm-blue' },
  epic: { label: '史诗', color: 'text-cm-purple', bg: 'bg-cm-purple-light', border: 'border-cm-purple' },
  legendary: { label: '传说', color: 'text-cm-accent', bg: 'bg-cm-accent-light', border: 'border-cm-accent' },
};

export default function AchievementsPage() {
  const navigate = useNavigate();
  const { completedDays, streak, totalXP } = useLearningStore();
  const state = { completedDays, streak, totalXP };

  const earnedCount = achievements.filter((a) => a.condition(state)).length;

  return (
    <div className="min-h-screen bg-cm-bg px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-1.5 text-sm text-cm-muted transition-colors hover:text-cm-accent"
        >
          <ArrowLeft size={16} />
          返回
        </button>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cm-amber-light text-cm-amber">
              <Trophy size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-cm-text">学习成就</h1>
              <p className="text-sm text-cm-text-secondary">坚持学习，解锁更多荣誉徽章</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8 rounded-3xl border border-cm-border bg-cm-card p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-cm-text-secondary">已解锁成就</p>
              <p className="text-3xl font-bold text-cm-text">
                {earnedCount} <span className="text-base font-medium text-cm-muted">/ {achievements.length}</span>
              </p>
            </div>
            <div className="h-16 w-16 rounded-full border-4 border-cm-border-light bg-cm-card-alt flex items-center justify-center">
              <span className="text-lg font-bold text-cm-accent">{Math.round((earnedCount / achievements.length) * 100)}%</span>
            </div>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-cm-card-alt">
            <div
              className="h-full rounded-full bg-cm-accent transition-all duration-500"
              style={{ width: `${(earnedCount / achievements.length) * 100}%` }}
            />
          </div>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2">
          {achievements.map((achievement, index) => {
            const earned = achievement.condition(state);
            const progress = achievement.progress(state);
            const cfg = rarityConfig[achievement.rarity];

            return (
              <motion.div
                key={achievement.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + index * 0.05 }}
                className={cn(
                  'flex items-start gap-4 rounded-3xl border-2 bg-cm-card p-5 transition-all',
                  earned ? cfg.border : 'border-cm-border-light',
                  !earned && 'opacity-70'
                )}
              >
                <div
                  className={cn(
                    'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl',
                    earned ? cfg.bg : 'bg-cm-card-alt'
                  )}
                >
                  {earned ? achievement.icon : <Lock size={22} className="text-cm-muted" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={cn('font-semibold', earned ? 'text-cm-text' : 'text-cm-muted')}>{achievement.name}</h3>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        earned ? cfg.bg + ' ' + cfg.color : 'bg-cm-card-alt text-cm-muted'
                      )}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-cm-text-secondary">{achievement.description}</p>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cm-card-alt">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', earned ? 'bg-cm-accent' : 'bg-cm-muted')}
                        style={{ width: `${Math.min((progress / achievement.target) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-cm-muted whitespace-nowrap">
                      {progress}/{achievement.target} {achievement.unit}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

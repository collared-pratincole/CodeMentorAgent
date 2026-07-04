import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Flame, FolderSearch, GraduationCap, MessageSquare, ArrowRight, Trophy, Calendar } from 'lucide-react'
import { useLearningStore } from '@/stores/useLearningStore'
import GlowCard from '@/components/common/GlowCard'
import ProgressRing from '@/components/common/ProgressRing'
import AchievementBadge from '@/components/common/AchievementBadge'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
}

const quickActions = [
  {
    icon: FolderSearch,
    title: '项目分析',
    description: '上传项目，AI 智能分析架构与代码',
    link: '/project',
    iconBg: 'bg-cm-purple-light',
    iconColor: 'text-cm-purple',
  },
  {
    icon: GraduationCap,
    title: '学习路径',
    description: '个性化学习路线，循序渐进掌握技能',
    link: '/learn',
    iconBg: 'bg-cm-green-light',
    iconColor: 'text-cm-green',
  },
  {
    icon: MessageSquare,
    title: 'AI 对话',
    description: '与 AI 导师实时交流，解答编程疑惑',
    link: '/chat',
    iconBg: 'bg-cm-amber-light',
    iconColor: 'text-cm-amber',
  },
]

export default function Dashboard() {
  const { profile, learningPath, currentDay, streak, totalXP, level, completedDays } =
    useLearningStore()

  const completedCount = completedDays.length
  const totalDays = learningPath?.totalDays ?? 365
  const completionPercentage = totalDays > 0 ? (completedCount / totalDays) * 100 : 0

  const now = new Date()
  const dateStr = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  // Replace demoAchievements with computed achievements from real data
  const achievements = []

  if (completedDays.length >= 1) {
    achievements.push({ id: 1, name: '初出茅庐', icon: '🎯', description: '完成第一天学习', earned: true, rarity: 'common' as const })
  }
  if (streak >= 7) {
    achievements.push({ id: 2, name: '连续七天', icon: '🔥', description: '连续学习7天', earned: true, rarity: 'rare' as const })
  }
  if (completedDays.length >= 10) {
    achievements.push({ id: 3, name: '知识探索者', icon: '📚', description: '完成10节课程', earned: true, rarity: 'rare' as const })
  }
  if (totalXP >= 1000) {
    achievements.push({ id: 4, name: '代码大师', icon: '💎', description: '累计获得1000经验值', earned: true, rarity: 'epic' as const })
  }
  if (completedDays.length >= 30) {
    achievements.push({ id: 5, name: '月度坚持', icon: '🌙', description: '完成30天学习', earned: true, rarity: 'epic' as const })
  }
  if (streak >= 30) {
    achievements.push({ id: 6, name: '习惯养成', icon: '⚡', description: '连续学习30天', earned: true, rarity: 'legendary' as const })
  }

  // If no achievements yet, show encouraging placeholder
  if (achievements.length === 0) {
    achievements.push({ id: 0, name: '等待解锁', icon: '🔒', description: '开始学习以解锁成就', earned: false, rarity: 'common' as const })
  }

  return (
    <div className="min-h-screen bg-cm-bg px-4 py-6 sm:px-6 lg:px-8">
      <motion.div
        className="mx-auto max-w-6xl space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Welcome Header */}
        <motion.div variants={itemVariants} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-cm-text sm:text-3xl lg:text-4xl">
              欢迎回来
            </h1>
            <div className="mt-1.5 flex items-center gap-2 text-cm-muted">
              <Calendar size={15} />
              <span className="text-sm">{dateStr}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-cm-amber-light bg-cm-card px-4 py-2.5 shadow-soft">
            <Flame size={20} className="text-cm-accent" />
            <span className="text-sm font-medium text-cm-text">
              连续学习 <span className="font-bold text-cm-accent">{streak}</span> 天
            </span>
          </div>
        </motion.div>

        {/* Today's Task Card */}
        <motion.div variants={itemVariants}>
          <GlowCard accent="amber" className="relative overflow-hidden">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cm-accent-light/40 blur-3xl" />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-cm-accent">
                  今日任务
                </div>
                {profile && learningPath ? (
                  <>
                    <h2 className="font-display text-xl font-bold text-cm-text sm:text-2xl">
                      第 {currentDay} 天 · {profile.language.toUpperCase()} 学习
                    </h2>
                    <p className="mt-1.5 text-sm text-cm-text-secondary">
                      继续你的学习之旅，今天将学习新的知识点
                    </p>
                    <div className="mt-1 text-xs text-cm-muted">
                      语言：{profile.language.toUpperCase()} · 已完成 {completedCount}/{totalDays} 天
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="font-display text-xl font-bold text-cm-text sm:text-2xl">
                      开始你的学习之旅
                    </h2>
                    <p className="mt-1.5 text-sm text-cm-text-secondary">
                      选择一门语言，开启个性化学习路径
                    </p>
                  </>
                )}
              </div>
              <div className="flex-shrink-0">
                <Link
                  to={profile ? `/learn/${profile.language}/day/${currentDay}` : '/learn'}
                  className="inline-flex items-center gap-2 rounded-xl bg-cm-accent px-6 py-3 text-sm font-semibold text-white shadow-accent transition-all hover:brightness-110"
                >
                  继续学习
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </GlowCard>
        </motion.div>

        {/* Learning Progress Section */}
        <motion.div variants={itemVariants}>
          <GlowCard title="学习进度" accent="green">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Left: Progress Ring */}
              <div className="flex items-center justify-center">
                <ProgressRing percentage={Math.round(completionPercentage)} size={150} strokeWidth={10} color="#5B8C5A" />
              </div>
              {/* Right: Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-cm-card-alt p-4 text-center">
                  <div className="text-2xl font-bold text-cm-text">{completedCount}</div>
                  <div className="mt-1 text-xs text-cm-muted">总学习天数</div>
                </div>
                <div className="rounded-xl bg-cm-card-alt p-4 text-center">
                  <div className="text-2xl font-bold text-cm-green">{completedCount}</div>
                  <div className="mt-1 text-xs text-cm-muted">完成课程</div>
                </div>
                <div className="rounded-xl bg-cm-card-alt p-4 text-center">
                  <div className="text-2xl font-bold text-cm-amber">{totalXP}</div>
                  <div className="mt-1 text-xs text-cm-muted">经验值</div>
                </div>
                <div className="rounded-xl bg-cm-card-alt p-4 text-center">
                  <div className="text-2xl font-bold text-cm-purple">Lv.{level}</div>
                  <div className="mt-1 text-xs text-cm-muted">当前等级</div>
                </div>
              </div>
            </div>
          </GlowCard>
        </motion.div>

        {/* Quick Actions Grid */}
        <motion.div variants={itemVariants}>
          <h2 className="mb-4 text-lg font-semibold text-cm-text">快速入口</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {quickActions.map((action) => (
              <Link key={action.link} to={action.link}>
                <motion.div
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.98 }}
                  className="group rounded-2xl bg-cm-card p-5 shadow-soft transition-shadow duration-300 hover:shadow-soft-md"
                >
                  <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${action.iconBg} ${action.iconColor}`}>
                    <action.icon size={22} />
                  </div>
                  <h3 className="text-base font-semibold text-cm-text">
                    {action.title}
                  </h3>
                  <p className="mt-1 text-sm text-cm-text-secondary">{action.description}</p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-medium text-cm-muted transition-colors group-hover:text-cm-accent">
                    <span>前往</span>
                    <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Recent Achievements */}
        <motion.div variants={itemVariants}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-cm-text">
              <Trophy size={20} className="text-cm-amber" />
              最近成就
            </h2>
            <Link
              to="/achievements"
              className="flex items-center gap-1 text-sm text-cm-muted transition-colors hover:text-cm-accent"
            >
              查看全部
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {achievements.map((achievement) => (
              <AchievementBadge
                key={achievement.name}
                name={achievement.name}
                icon={achievement.icon}
                description={achievement.description}
                earned={achievement.earned}
                rarity={achievement.rarity}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

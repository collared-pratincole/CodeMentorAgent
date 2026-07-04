import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, CheckCircle, Flame, Star, ArrowRight, RotateCcw, Calendar,
  Loader2, Sparkles, GraduationCap, Target, Clock, Code, Info
} from 'lucide-react'
import { useLearningStore, type LearningProfile } from '@/stores/useLearningStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { LANGUAGES, getLanguageById } from '@/data/languages'
import { createProvider } from '@/services/ai'
import { buildLearningPlanPrompt } from '@/utils/promptBuilder'
import { parseAIResponseRobust } from '@/utils/aiParser'
import { isLearningPlan, type LearningPlanOutput } from '@/types/ai-output'
import GlowCard from '@/components/common/GlowCard'
import ProgressRing from '@/components/common/ProgressRing'
import BrandIcon from '@/components/common/BrandIcon'
import { cn } from '@/lib/utils'

export default function LearningPath() {
  const { profile, learningPath, isGenerating } = useLearningStore()

  // 生成中：显示加载界面
  if (isGenerating) {
    return <GeneratingView />
  }

  if (!profile || !learningPath) {
    return <LearningForm />
  }

  return <LearningOverview />
}

// ==================== AI 生成中视图 ====================
function GeneratingView() {
  return (
    <div className="min-h-screen bg-cm-bg flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-md"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-cm-accent-light mb-6"
        >
          <Sparkles className="h-10 w-10 text-cm-accent" />
        </motion.div>
        <h2 className="font-display text-2xl font-bold text-cm-text mb-3">
          AI 正在为你定制学习计划
        </h2>
        <p className="text-sm text-cm-text-secondary leading-relaxed mb-6">
          正在根据你的学情信息，调用 AI 模型生成个性化的年度学习路线...
          <br />这可能需要 10-30 秒，请耐心等待
        </p>
        <div className="flex items-center justify-center gap-1.5">
          {[0, 0.2, 0.4].map((delay) => (
            <motion.div
              key={delay}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay }}
              className="w-2.5 h-2.5 rounded-full bg-cm-accent"
            />
          ))}
        </div>
      </motion.div>
    </div>
  )
}

// ==================== 学习表单 ====================
function LearningForm() {
  const navigate = useNavigate()
  const { setProfile, setLearningPath, setGenerating, isGenerating } = useLearningStore()
  const { getActiveModel, userModels } = useSettingsStore()

  const [language, setLanguage] = useState('')
  const [background, setBackground] = useState('')
  const [goal, setGoal] = useState('')
  const [dailyMinutes, setDailyMinutes] = useState(30)
  const [style, setStyle] = useState<LearningProfile['style']>('balanced')
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    console.log('[LearningPath] handleSubmit 被调用', { language, goal, hasBackground: !!background })

    if (!language) { setError('请选择学习语言'); return }
    if (!goal.trim()) { setError('请填写学习目标'); return }

    const activeModel = getActiveModel()
    if (!activeModel) {
      console.warn('[LearningPath] getActiveModel() 返回 null，无法调用 AI')
      setError('请先在设置中配置 AI 模型')
      return
    }

    const profile: LearningProfile = { language, background, goal, dailyMinutes, style }

    // 先清除旧数据，再开始生成，防止旧 learningPath 干扰
    setLearningPath(null)
    setProfile(profile)
    setGenerating(true)
    setError('')

    try {
      const provider = createProvider(activeModel.baseUrl, activeModel.model)
      const prompt = buildLearningPlanPrompt(profile)

      console.log('[LearningPath] 开始调用 AI 生成学习计划...', { baseUrl: activeModel.baseUrl, model: activeModel.model })

      let fullResponse = ''
      await provider.sendMessage(
        [{ role: 'user', content: prompt }],
        activeModel.apiKey,
        (chunk) => { fullResponse += chunk }
      )

      console.log('[LearningPath] AI 返回完成，长度:', fullResponse.length, '前200字:', fullResponse.slice(0, 200))

      // 解析 AI 返回的标准 JSON
      const parsed = parseAIResponseRobust<LearningPlanOutput>(fullResponse, {
        type: 'learning_plan',
        overview: '',
        months: [],
      })

      if (!isLearningPlan(parsed) || parsed.months.length === 0) {
        console.error('[LearningPath] AI 返回格式不正确:', JSON.stringify(parsed).slice(0, 500))
        throw new Error('AI 返回的数据格式不正确，请重试')
      }

      console.log('[LearningPath] 解析成功，共', parsed.months.length, '个月')

      const path = {
        id: `path-${Date.now()}`,
        profile,
        months: parsed.months,
        totalDays: 365,
        overview: parsed.overview || '',
        createdAt: new Date().toISOString(),
      }

      setLearningPath(path)
      navigate(`/learn/${language}`)
    } catch (err: any) {
      console.error('[LearningPath] 生成学习计划失败:', err)
      setError(`生成学习计划失败：${err.message || '请检查模型配置'}`)
      // 生成失败时清除 profile，让用户回到表单
      setProfile(null)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-cm-bg flex flex-col items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        {/* 标题 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cm-accent-light mb-4">
            <GraduationCap className="h-8 w-8 text-cm-accent" />
          </div>
          <h1 className="font-display text-2xl font-bold text-cm-text sm:text-3xl">
            定制你的学习计划
          </h1>
          <p className="text-sm text-cm-text-secondary mt-2">
            填写以下信息，AI 将为你生成专属的年度学习路线
          </p>
        </div>

        {/* 表单 */}
        <div className="rounded-2xl border border-cm-border bg-cm-card p-6 shadow-soft-md sm:p-8 space-y-6">
          {/* 1. 学习语言 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-cm-text mb-2">
              <Code className="h-4 w-4 text-cm-accent" />
              你要学什么语言？
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setLanguage(lang.id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all',
                    language === lang.id
                      ? 'border-cm-accent bg-cm-accent-light shadow-accent'
                      : 'border-cm-border bg-cm-card hover:border-cm-accent/40 hover:shadow-soft'
                  )}
                >
                  <BrandIcon src={lang.iconUrl} name={lang.name} size={24} rounded bgColor={lang.color} />
                  <span className={cn(
                    'text-[10px] font-medium text-center leading-tight',
                    language === lang.id ? 'text-cm-accent' : 'text-cm-text-secondary'
                  )}>
                    {lang.name}
                  </span>
                </button>
              ))}
            </div>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-xl border border-cm-border bg-cm-bg px-4 py-3 text-sm text-cm-text focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30 appearance-none cursor-pointer"
            >
              <option value="">选择编程语言...</option>
              {LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. 基础情况 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-cm-text mb-2">
              <BookOpen className="h-4 w-4 text-cm-accent" />
              你有这门语言的基础吗？
            </label>
            <textarea
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="例如：完全没有基础 / 学过一点语法 / 做过几个小项目 / 用过但想系统学习..."
              rows={3}
              className="w-full rounded-xl border border-cm-border bg-cm-bg px-4 py-3 text-sm text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30 resize-none"
            />
          </div>

          {/* 3. 学习目标 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-cm-text mb-2">
              <Target className="h-4 w-4 text-cm-accent" />
              你的学习目标是什么？
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="例如：想找一份后端开发工作 / 想做自己的网站 / 想学数据分析 / 想转行做程序员..."
              rows={3}
              className="w-full rounded-xl border border-cm-border bg-cm-bg px-4 py-3 text-sm text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30 resize-none"
            />
          </div>

          {/* 4. 每日学习时长 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-cm-text mb-2">
              <Clock className="h-4 w-4 text-cm-accent" />
              每天能学多久？
            </label>
            <div className="flex gap-2">
              {[15, 30, 60, 90, 120].map((min) => (
                <button
                  key={min}
                  onClick={() => setDailyMinutes(min)}
                  className={cn(
                    'flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors',
                    dailyMinutes === min
                      ? 'bg-cm-accent text-white shadow-accent'
                      : 'bg-cm-card-alt border border-cm-border text-cm-text-secondary hover:border-cm-accent/40'
                  )}
                >
                  {min}分
                </button>
              ))}
            </div>
          </div>

          {/* 5. 学习风格 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-cm-text mb-2">
              <Sparkles className="h-4 w-4 text-cm-accent" />
              你更喜欢哪种学习方式？
            </label>
            <div className="grid grid-cols-3 gap-3">
              {([
                { id: 'balanced' as const, label: '均衡模式', desc: '理论与实战并重', icon: '⚖️' },
                { id: 'theory' as const, label: '理论优先', desc: '先理解再动手', icon: '📖' },
                { id: 'practice' as const, label: '实战优先', desc: '边做边学', icon: '💻' },
              ]).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  className={cn(
                    'rounded-2xl border p-4 text-center transition-all',
                    style === s.id
                      ? 'border-cm-accent bg-cm-accent-light shadow-accent'
                      : 'border-cm-border bg-cm-card hover:border-cm-accent/40'
                  )}
                >
                  <span className="text-2xl">{s.icon}</span>
                  <div className={cn(
                    'text-sm font-medium mt-2',
                    style === s.id ? 'text-cm-accent' : 'text-cm-text'
                  )}>
                    {s.label}
                  </div>
                  <div className="text-xs text-cm-muted mt-1">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="rounded-xl bg-cm-red/10 px-4 py-3 text-sm text-cm-red">
              {error}
            </div>
          )}

          {/* 提交按钮 */}
          <button
            onClick={handleSubmit}
            disabled={isGenerating || !language}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-cm-accent py-3.5 text-sm font-semibold text-white shadow-accent hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                AI 正在为你定制学习计划...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                生成我的学习计划
              </>
            )}
          </button>

          {!userModels.length && (
            <p className="text-center text-xs text-cm-muted">
              需要先在<a href="/settings" className="text-cm-accent underline">设置</a>中配置 AI 模型
            </p>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ==================== 学习路径概览 ====================
function LearningOverview() {
  const navigate = useNavigate()
  const { profile, learningPath, currentDay, streak, totalXP, level, completedDays, reset } = useLearningStore()

  if (!profile || !learningPath) return null

  const lang = getLanguageById(profile.language)
  const completedCount = completedDays.length
  const progressPercent = Math.round((completedCount / learningPath.totalDays) * 100)
  const currentMonth = Math.ceil(currentDay / 30)

  return (
    <div className="min-h-screen bg-cm-bg p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <BrandIcon src={lang.iconUrl} name={lang.name} size={48} rounded bgColor={lang.color} />
            <div>
              <h1 className="font-display text-2xl font-bold text-cm-text sm:text-3xl">{lang.name}</h1>
              <p className="text-cm-muted mt-1">AI 定制 · 年度学习计划</p>
              {learningPath.createdAt && (
                <p className="text-xs text-cm-muted mt-0.5">
                  生成时间：{new Date(learningPath.createdAt).toLocaleString('zh-CN')}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/learn/${profile.language}/day/${currentDay}`)}
              className="flex items-center gap-2 rounded-xl bg-cm-accent px-5 py-2.5 text-sm font-semibold text-white shadow-accent hover:brightness-110"
            >
              <BookOpen size={18} />
              今日课程
            </button>
            <button
              onClick={() => { if (confirm('确定要重新制定学习计划吗？所有进度将被清除。')) reset() }}
              className="flex items-center gap-2 rounded-xl border border-cm-border px-4 py-2.5 text-sm text-cm-muted hover:border-cm-accent/50 hover:text-cm-accent"
            >
              <RotateCcw size={16} />
              重新规划
            </button>
          </div>
        </div>

        {/* 旧数据提示 */}
        {learningPath.createdAt && (() => {
          const hoursSinceCreation = (Date.now() - new Date(learningPath.createdAt).getTime()) / (1000 * 60 * 60)
          return hoursSinceCreation > 1 ? (
            <div className="rounded-xl border border-cm-amber/30 bg-cm-amber-light/50 px-4 py-3 mb-6 flex items-start gap-3">
              <Info size={18} className="text-cm-amber shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-cm-text font-medium">这是之前生成的学习计划</p>
                <p className="text-xs text-cm-text-secondary mt-1">
                  该计划生成于 {new Date(learningPath.createdAt).toLocaleString('zh-CN')}，如需根据最新情况重新规划，请点击右上角「重新规划」按钮
                </p>
              </div>
            </div>
          ) : null
        })()}

        {/* Overview */}
        {learningPath.overview && (
          <div className="rounded-2xl border border-cm-border bg-cm-card p-5 shadow-soft mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-cm-accent" />
              <span className="text-sm font-semibold text-cm-text">AI 学习建议</span>
            </div>
            <p className="text-sm text-cm-text-secondary leading-relaxed">{learningPath.overview}</p>
          </div>
        )}

        {/* Stats Bar */}
        <div className="grid grid-cols-2 gap-3 mb-8 lg:grid-cols-4">
          <GlowCard accent="green">
            <div className="flex items-center gap-3 sm:gap-4">
              <ProgressRing percentage={progressPercent} size={48} color="#5B8C5A" />
              <div>
                <p className="text-xs text-cm-muted">学习进度</p>
                <p className="text-xl font-bold text-cm-text">{progressPercent}%</p>
              </div>
            </div>
          </GlowCard>
          <GlowCard accent="green">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cm-green-light">
                <CheckCircle size={22} className="text-cm-green" />
              </div>
              <div>
                <p className="text-xs text-cm-muted">已完成</p>
                <p className="text-xl font-bold text-cm-text">{completedCount}<span className="text-xs text-cm-muted">/365天</span></p>
              </div>
            </div>
          </GlowCard>
          <GlowCard accent="amber">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cm-amber-light">
                <Flame size={22} className="text-cm-amber" />
              </div>
              <div>
                <p className="text-xs text-cm-muted">连续学习</p>
                <p className="text-xl font-bold text-cm-text">{streak}<span className="text-xs text-cm-muted">天</span></p>
              </div>
            </div>
          </GlowCard>
          <GlowCard accent="purple">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cm-purple-light">
                <Star size={22} className="text-cm-purple" />
              </div>
              <div>
                <p className="text-xs text-cm-muted">经验值</p>
                <p className="text-xl font-bold text-cm-text">{totalXP}<span className="text-xs text-cm-muted">XP · Lv.{level}</span></p>
              </div>
            </div>
          </GlowCard>
        </div>

        {/* 12-Month Timeline */}
        <h2 className="text-lg font-semibold text-cm-text mb-4 flex items-center gap-2">
          <Calendar size={20} className="text-cm-accent" />
          年度学习路线
        </h2>

        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-x-visible lg:pb-0">
          {learningPath.months.map((monthData) => {
            const isCurrentMonth = monthData.month === currentMonth
            const isCompleted = monthData.month < currentMonth
            const startDay = (monthData.month - 1) * 30 + 1
            const daysInMonth = 30
            const completedInMonth = isCompleted
              ? daysInMonth
              : Math.max(0, Math.min(currentDay - startDay + 1, daysInMonth))
            const monthProgress = Math.round((completedInMonth / daysInMonth) * 100)

            return (
              <motion.div
                key={monthData.month}
                whileHover={{ y: -4 }}
                className={cn(
                  'min-w-0 flex-shrink-0 w-56 rounded-xl border p-4 cursor-pointer transition-all sm:w-64 sm:p-5',
                  isCurrentMonth
                    ? 'border-cm-accent bg-cm-card shadow-soft-md'
                    : isCompleted
                    ? 'border-cm-border-light bg-cm-card'
                    : 'border-cm-border bg-cm-card shadow-soft'
                )}
                onClick={() => navigate(`/learn/${profile.language}/day/${startDay}`)}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={cn(
                    'text-xs font-bold px-2 py-1 rounded-lg',
                    isCurrentMonth ? 'bg-cm-accent-light text-cm-accent' : 'bg-cm-card-alt text-cm-muted'
                  )}>
                    第 {monthData.month} 月
                  </span>
                  {isCompleted && <CheckCircle size={18} className="text-cm-green" />}
                  {isCurrentMonth && <span className="text-xs text-cm-accent font-medium">当前</span>}
                </div>
                <h3 className="text-sm font-semibold text-cm-text mb-2">{monthData.title}</h3>
                <ul className="space-y-1 mb-4">
                  {monthData.topics.map((topic, i) => (
                    <li key={i} className="text-xs text-cm-text-secondary flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-cm-border" />
                      {topic}
                    </li>
                  ))}
                </ul>
                <div className="w-full bg-cm-border-light rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${monthProgress}%`,
                      backgroundColor: isCompleted ? '#5B8C5A' : isCurrentMonth ? '#C4703F' : '#E8E0D4',
                    }}
                  />
                </div>
                <p className="text-xs text-cm-muted mt-1">{monthProgress}%</p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

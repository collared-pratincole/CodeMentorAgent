import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, CheckCircle, Lightbulb, Play, Send,
  Sparkles, Trophy, Loader2, Terminal
} from 'lucide-react'
import { useLearningStore, type LessonExercise } from '@/stores/useLearningStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUserStore } from '@/stores/useUserStore'
import { getLanguageById } from '@/data/languages'
import { createProvider } from '@/services/ai'
import { buildDailyLessonPrompt, buildCodeReviewPrompt } from '@/utils/promptBuilder'
import { parseAIResponseRobust } from '@/utils/aiParser'
import { isDailyLesson, isCodeReview, type DailyLessonOutput, type LessonSection, type CodeReviewOutput } from '@/types/ai-output'
import { executeCode, type ExecuteResult } from '@/services/api'
import { useTaskQueueStore } from '@/stores/useTaskQueueStore'
import CodeEditor from '@/components/editor/CodeEditor'
import GlowCard from '@/components/common/GlowCard'
import BrandIcon from '@/components/common/BrandIcon'

export default function DailyLesson() {
  const { language, dayId } = useParams()
  const navigate = useNavigate()
  const {
    profile, learningPath, currentDay, completedDays, completeDay, addXP,
    currentLessonSections, currentExercise, currentLessonDay,
    setLessonData, clearLessonData, getLessonData,
    isLessonGenerating, setLessonGenerating,
  } = useLearningStore()
  const { getActiveModel } = useSettingsStore()

  const dayNum = parseInt(dayId || '1', 10)
  const isCompleted = completedDays.includes(dayNum)
  const lang = language ? getLanguageById(language) : { id: '', name: language || '', iconUrl: '', color: '#6B5D4D' }

  // 计算当前主题
  const currentMonth = Math.ceil(dayNum / 30)
  const monthData = learningPath?.months.find((m) => m.month === currentMonth)
  const topicIndex = (dayNum - 1) % 30
  const topic = monthData?.topics
    ? monthData.topics[Math.min(Math.floor(topicIndex / (30 / monthData.topics.length)), monthData.topics.length - 1)]
    : '基础练习'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [output, setOutput] = useState('')
  const [showCelebration, setShowCelebration] = useState(false)
  // 运行失败时提示改用"提交"给 AI 检查
  const [showRunFailHint, setShowRunFailHint] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [codeReviewing, setCodeReviewing] = useState(false)
  const [localRunning, setLocalRunning] = useState(false)
  const [localResult, setLocalResult] = useState<ExecuteResult | null>(null)
  const [localError, setLocalError] = useState('')
  const [mobileView, setMobileView] = useState<'lesson' | 'editor'>('lesson')

  // 加载课程内容
  useEffect(() => {
    const langKey = language || ''
    // 1. 优先从按天缓存读取
    const cached = getLessonData(langKey, dayNum)
    if (cached && cached.sections.length > 0) {
      setLessonData(cached.sections, cached.exercise, dayNum, langKey)
      setCode(cached.exercise.starterCode)
      return
    }
    // 2. 兼容旧数据
    if (currentLessonDay === dayNum && currentLessonSections.length > 0) {
      if (currentExercise) setCode(currentExercise.starterCode)
      return
    }
    // 3. 正在生成中（其他组件实例触发的生成），不重复触发
    if (isLessonGenerating(langKey, dayNum)) {
      setLoading(true)
      return
    }
    // 4. 触发生成
    loadLesson()
  }, [dayNum, language])

  const loadLesson = async () => {
    const activeModel = getActiveModel()
    if (!activeModel || !profile || !learningPath) {
      setError('请先在设置中配置 AI 模型和 API Key，课程内容将由 AI 动态生成')
      return
    }

    const langKey = language || ''
    // 标记为生成中（持久化到 store，组件卸载也不丢失）
    setLessonGenerating(langKey, dayNum, true)
    setLoading(true)
    setError('')
    clearLessonData()

    // 接入任务队列
    const { createTask, updateTask } = useTaskQueueStore.getState()
    const task = await createTask({
      title: `准备第 ${dayNum} 天课程：${topic}`,
      type: 'lesson',
    })
    // 立即更新一次进度，避免 0% 卡顿
    if (task) updateTask(task.id, { progress: 5 })

    try {
      const provider = createProvider(activeModel.baseUrl, activeModel.model)
      const previousTopics = learningPath.months
        .filter((m) => m.month < currentMonth)
        .flatMap((m) => m.topics)

      const prompt = buildDailyLessonPrompt(
        profile.language,
        dayNum,
        topic,
        monthData?.title || '',
        profile.background,
        profile.style,
        previousTopics
      )

      console.log('[DailyLesson] 开始调用 AI 生成课程...', { day: dayNum, topic, model: activeModel.model })

      let fullResponse = ''
      let chunkCount = 0
      await provider.sendMessage(
        [{ role: 'user', content: prompt }],
        { userId: useUserStore.getState().currentUserId!, modelId: activeModel.id },
        (chunk) => {
          fullResponse += chunk
          chunkCount++
          if (task && chunkCount % 3 === 0) {
            updateTask(task.id, { progress: Math.min(5 + chunkCount * 2, 85) })
          }
        }
      )

      if (task) updateTask(task.id, { progress: 90 })

      console.log('[DailyLesson] AI 返回完成，长度:', fullResponse.length)

      const parsed = parseAIResponseRobust<DailyLessonOutput>(fullResponse, {
        type: 'daily_lesson',
        title: '',
        sections: [],
        exercise: { description: '', starterCode: '', hint: '', expectedOutput: '' },
      })

      if (!isDailyLesson(parsed)) {
        console.error('[DailyLesson] AI 返回格式不正确:', JSON.stringify(parsed).slice(0, 500))
        throw new Error('AI 返回的课程格式不正确，请重试')
      }

      console.log('[DailyLesson] 解析成功，共', parsed.sections.length, '个知识点段落')

      const exercise: LessonExercise = {
        description: parsed.exercise.description,
        starterCode: parsed.exercise.starterCode,
        hint: parsed.exercise.hint,
        expectedOutput: parsed.exercise.expectedOutput,
      }

      // setLessonData 会自动清除 generatingLessons 标记
      setLessonData(parsed.sections, exercise, dayNum, langKey)
      setCode(exercise.starterCode)
      if (task) updateTask(task.id, { status: 'completed', progress: 100 })
    } catch (err: any) {
      console.error('[DailyLesson] 加载课程失败:', err)
      setError('加载课程失败：' + err.message)
      // 失败时清除生成中标记，允许重试
      setLessonGenerating(langKey, dayNum, false)
      if (task) updateTask(task.id, { status: 'failed', error: err?.message || '课程生成失败' })
    } finally {
      setLoading(false)
    }
  }

  const handleRun = async () => {
    const activeModel = getActiveModel()
    if (!activeModel) {
      setOutput('请先在设置中配置 AI 模型')
      return
    }
    if (!code.trim()) {
      setOutput('请先编写代码')
      return
    }

    setCodeReviewing(true)
    setOutput('AI 正在审查你的代码...')

    try {
      const provider = createProvider(activeModel.baseUrl, activeModel.model)
      const prompt = buildCodeReviewPrompt(code, currentExercise?.starterCode, language || 'python')

      let fullResponse = ''
      await provider.sendMessage(
        [{ role: 'user', content: prompt }],
        { userId: useUserStore.getState().currentUserId!, modelId: activeModel.id },
        (chunk) => { fullResponse += chunk }
      )

      const parsed = parseAIResponseRobust<CodeReviewOutput>(fullResponse, {
        type: 'code_review',
        score: 0,
        issues: [],
        summary: '',
      })

      if (isCodeReview(parsed)) {
        const lines: string[] = []
        lines.push(`📊 评分：${parsed.score}/100`)
        lines.push('')
        lines.push(`📝 ${parsed.summary}`)
        if (parsed.issues.length > 0) {
          lines.push('')
          lines.push('🔍 发现的问题：')
          parsed.issues.forEach((issue, i) => {
            const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️'
            lines.push(`  ${icon} [${issue.category}] ${issue.description}`)
            if (issue.suggestion) lines.push(`     💡 建议：${issue.suggestion}`)
          })
        }
        if (parsed.improvedCode) {
          lines.push('')
          lines.push('✨ 改进后的代码：')
          lines.push(parsed.improvedCode)
        }
        setOutput(lines.join('\n'))
      } else {
        setOutput(fullResponse || 'AI 审查完成，但返回格式无法解析')
      }
    } catch (err: any) {
      setOutput(`代码审查失败：${err.message || '请检查模型配置'}`)
    } finally {
      setCodeReviewing(false)
    }
  }

  const handleSubmit = async () => {
    const activeModel = getActiveModel()
    if (!activeModel) {
      setOutput('请先在设置中配置 AI 模型')
      return
    }
    if (!code.trim()) {
      setOutput('请先编写代码再提交')
      return
    }
    // 仅检查代码是否与起始代码完全相同（未做任何修改）
    if (currentExercise && code.trim() === currentExercise.starterCode.trim()) {
      setOutput('请先修改或补充起始代码后再提交')
      return
    }

    setCodeReviewing(true)
    setOutput('AI 正在评估你的提交...')

    try {
      const provider = createProvider(activeModel.baseUrl, activeModel.model)
      const prompt = buildCodeReviewPrompt(code, currentExercise?.starterCode, language || 'python')

      let fullResponse = ''
      await provider.sendMessage(
        [{ role: 'user', content: prompt }],
        { userId: useUserStore.getState().currentUserId!, modelId: activeModel.id },
        (chunk) => { fullResponse += chunk }
      )

      const parsed = parseAIResponseRobust<CodeReviewOutput>(fullResponse, {
        type: 'code_review',
        score: 0,
        issues: [],
        summary: '',
      })

      if (isCodeReview(parsed)) {
        const lines: string[] = []
        if (parsed.score >= 80) {
          lines.push('🎉 优秀！代码质量很高！')
        } else if (parsed.score >= 60) {
          lines.push('👍 不错！还有改进空间')
        } else {
          lines.push('💪 继续加油！看看下面的建议')
        }
        lines.push(`📊 评分：${parsed.score}/100`)
        lines.push(`📝 ${parsed.summary}`)
        if (parsed.issues.length > 0) {
          lines.push('')
          lines.push('🔍 需要改进的地方：')
          parsed.issues.forEach((issue) => {
            const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️'
            lines.push(`  ${icon} ${issue.description}`)
            if (issue.suggestion) lines.push(`     💡 ${issue.suggestion}`)
          })
        }
        if (parsed.improvedCode) {
          lines.push('')
          lines.push('✨ 参考改进：')
          lines.push(parsed.improvedCode)
        }
        setOutput(lines.join('\n'))
      } else {
        setOutput(fullResponse || 'AI 评估完成，但返回格式无法解析')
      }
    } catch (err: any) {
      setOutput(`提交评估失败：${err.message || '请检查模型配置'}`)
    } finally {
      setCodeReviewing(false)
    }
  }

  const handleComplete = () => {
    completeDay(dayNum)
    addXP(50)
    setShowCelebration(true)
    setTimeout(() => setShowCelebration(false), 3000)
  }

  // 本地运行代码
  const handleLocalRun = async () => {
    if (!code.trim()) {
      setLocalError('请先编写代码')
      return
    }

    setLocalRunning(true)
    setLocalError('')
    setLocalResult(null)

    try {
      const langMap: Record<string, string> = {
        python: 'python', py: 'python',
        javascript: 'javascript', js: 'javascript',
        typescript: 'typescript', ts: 'typescript',
      }
      const execLang = langMap[(language || 'python').toLowerCase()] || 'python'
      const res = await executeCode(execLang, code)
      setLocalResult(res)
      // 运行失败（非 0 退出码或 success=false）时弹窗提示改用"提交"
      if (!res.success) {
        setShowRunFailHint(true)
      }
    } catch (err: any) {
      setLocalError(err.message || '执行失败')
      setShowRunFailHint(true)
    } finally {
      setLocalRunning(false)
    }
  }

  // 基于 LessonSection[] 的结构化渲染
  const renderSections = (sections: LessonSection[]) => {
    return sections.map((section, idx) => {
      const headingClass = section.level === 1
        ? 'font-display text-2xl font-bold text-cm-text mt-8 mb-4'
        : section.level === 2
        ? 'font-display text-xl font-bold text-cm-text mt-6 mb-3'
        : 'text-lg font-semibold text-cm-text mt-4 mb-2'

      return (
        <div key={idx} className="mb-4">
          <div className={headingClass}>{section.heading}</div>
          {section.body && (
            <p className="text-sm text-cm-text-secondary leading-relaxed mb-3">
              {renderInline(section.body)}
            </p>
          )}
          {section.list && (
            <ul className="space-y-1.5 mb-3 ml-1">
              {section.list.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-cm-text-secondary">
                  <div className="w-1.5 h-1.5 rounded-full bg-cm-accent mt-2 shrink-0" />
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          )}
          {section.code && (
            <div className="rounded-xl border border-cm-border bg-cm-card-alt overflow-hidden my-3">
              <div className="flex items-center justify-between px-4 py-2 bg-cm-card border-b border-cm-border">
                <span className="text-xs text-cm-muted font-mono">{section.code.language}</span>
                {section.code.caption && (
                  <span className="text-xs text-cm-text-secondary">{section.code.caption}</span>
                )}
              </div>
              <pre className="p-4 overflow-x-auto">
                <code className="text-sm leading-relaxed text-cm-text font-mono">
                  {section.code.content}
                </code>
              </pre>
            </div>
          )}
          {section.tip && (
            <div className="border-l-4 border-cm-amber bg-cm-amber-light rounded-r-xl px-4 py-3 my-3">
              <p className="text-sm text-cm-text">{renderInline(section.tip)}</p>
            </div>
          )}
        </div>
      )
    })
  }

  // 内联标记渲染（**粗体** 和 `代码`）
  const renderInline = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = []
    let remaining = text
    let key = 0
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      const codeMatch = remaining.match(/`(.+?)`/)
      let first: { index: number; length: number; content: React.ReactNode } | null = null
      if (boldMatch && boldMatch.index !== undefined) {
        const c = { index: boldMatch.index, length: boldMatch[0].length, content: <strong key={`b-${key++}`} className="text-cm-accent font-semibold">{boldMatch[1]}</strong> }
        if (!first || c.index < (first as any).index) first = c
      }
      if (codeMatch && codeMatch.index !== undefined) {
        const c = { index: codeMatch.index, length: codeMatch[0].length, content: <code key={`c-${key++}`} className="px-1.5 py-0.5 rounded-lg bg-cm-card-alt text-cm-amber text-xs font-mono">{codeMatch[1]}</code> }
        if (!first || c.index < (first as any).index) first = c
      }
      if (!first) { parts.push(remaining); break }
      if (first.index > 0) parts.push(remaining.slice(0, first.index))
      parts.push(first.content)
      remaining = remaining.slice(first.index + first.length)
    }
    return parts
  }

  return (
    <div className="min-h-screen bg-cm-bg flex flex-col">
      {/* Celebration */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
              className="rounded-2xl bg-cm-card p-8 shadow-soft-lg text-center">
              <motion.div animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] }} transition={{ duration: 0.5, repeat: 2 }}>
                <Trophy size={64} className="text-cm-amber mx-auto" />
              </motion.div>
              <h2 className="font-display text-2xl font-bold text-cm-text mt-6">课程完成！</h2>
              <p className="text-cm-green text-xl mt-2">+50 XP</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 运行失败提示 */}
      <AnimatePresence>
        {showRunFailHint && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setShowRunFailHint(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              className="w-full max-w-md rounded-2xl bg-cm-card p-6 shadow-soft-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="shrink-0 h-10 w-10 rounded-xl bg-cm-amber-light flex items-center justify-center">
                  <Lightbulb size={20} className="text-cm-amber" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-cm-text">本地运行未成功</h3>
                  <p className="text-sm text-cm-muted mt-1 leading-relaxed">
                    部分代码由于环境差异（如依赖缺失、图形界面、特殊库等）可能在本地无法直接运行，这并不代表你的代码有错。
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-cm-accent-light/40 border border-cm-accent/20 px-4 py-3 mb-4">
                <p className="text-sm text-cm-text-secondary leading-relaxed">
                  直接点击 <span className="font-semibold text-cm-accent">「提交」</span> 按钮，让 AI 帮你检查代码并打分即可。
                </p>
              </div>
              <button
                onClick={() => setShowRunFailHint(false)}
                className="w-full rounded-xl bg-cm-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                知道了
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="border-b border-cm-border bg-cm-card px-4 py-3 sm:px-6 sm:py-4">
        <div className="max-w-[1600px] mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-cm-accent-light px-3 py-1 text-sm font-bold text-cm-accent">
              第 {dayNum} 天
            </span>
            <h1 className="text-lg font-bold text-cm-text sm:text-xl">
              {loading ? '加载中...' : topic}
            </h1>
            <span className="rounded-lg px-2 py-0.5 text-xs font-medium bg-cm-card-alt text-cm-muted inline-flex items-center gap-1">
              <BrandIcon src={lang.iconUrl} name={lang.name} size={16} /> {lang.name}
            </span>
          </div>
          <div className="text-sm text-cm-muted">第 {dayNum} / 365 天</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col xl:flex-row max-w-[1600px] mx-auto w-full overflow-hidden">
        {/* Mobile Tab Switcher */}
        <div className="flex xl:hidden border-b border-cm-border bg-cm-card">
          <button
            onClick={() => setMobileView('lesson')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mobileView === 'lesson'
                ? 'text-cm-accent border-b-2 border-cm-accent'
                : 'text-cm-muted border-b-2 border-transparent'
            }`}
          >
            📚 课程内容
          </button>
          <button
            onClick={() => setMobileView('editor')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mobileView === 'editor'
                ? 'text-cm-accent border-b-2 border-cm-accent'
                : 'text-cm-muted border-b-2 border-transparent'
            }`}
          >
            ✏️ 代码练习
          </button>
        </div>

        {/* Knowledge Panel */}
        <div className={`${mobileView === 'lesson' ? 'block' : 'hidden'} xl:block w-full border-b border-cm-border p-4 overflow-y-auto xl:w-[55%] xl:border-b-0 xl:border-r xl:p-6 xl:h-[calc(100vh-8rem)]`}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 text-cm-accent animate-spin mb-4" />
              <p className="text-sm text-cm-muted">AI 正在为你准备今日课程...</p>
            </div>
          ) : error && !currentLessonSections.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-4xl mb-4">⚙️</div>
              <p className="text-cm-red text-sm mb-2">{error}</p>
              <div className="flex gap-3 mt-4">
                <button onClick={loadLesson} className="rounded-xl bg-cm-accent px-4 py-2 text-sm font-medium text-white">
                  重试
                </button>
                <a href="/settings" className="rounded-xl border border-cm-border px-4 py-2 text-sm text-cm-muted hover:text-cm-accent">
                  前往设置
                </a>
              </div>
            </div>
          ) : (
            <>
              <GlowCard accent="green" className="mb-6">
                <div className="text-cm-green text-sm font-medium">📚 今日主题：{topic}</div>
              </GlowCard>
              <div>{renderSections(currentLessonSections)}</div>
              {currentExercise && (
                <div className="mt-6 rounded-xl border border-cm-accent/20 bg-cm-accent-light/30 p-4">
                  <h3 className="text-base font-semibold text-cm-accent mb-2">✏️ 课后练习</h3>
                  <p className="text-sm text-cm-text-secondary">{currentExercise.description}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Editor Panel */}
        <div className={`${mobileView === 'editor' ? 'flex' : 'hidden'} w-full flex-col bg-cm-bg xl:flex xl:w-[45%] xl:h-[calc(100vh-8rem)] overflow-hidden`}>
          <div className="p-3 border-b border-cm-border flex items-center justify-between bg-cm-card sm:p-4">
            <span className="text-sm font-semibold text-cm-text">✏️ 代码练习</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowHint(!showHint)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-cm-amber-light text-cm-amber">
                <Lightbulb size={14} /> 提示
              </button>
              <button onClick={handleLocalRun} disabled={localRunning || codeReviewing}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-cm-green/10 text-cm-green border border-cm-green/30 disabled:opacity-50"
                title="在本地运行代码"
              >
                {localRunning ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />} 运行
              </button>
              <button onClick={handleRun} disabled={codeReviewing || localRunning}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-cm-green-light text-cm-green disabled:opacity-50">
                {codeReviewing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} 审查
              </button>
              <button onClick={handleSubmit} disabled={codeReviewing || localRunning}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-cm-accent-light text-cm-accent disabled:opacity-50">
                {codeReviewing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} 提交
              </button>
            </div>
          </div>

          <AnimatePresence>
            {showHint && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-4 py-3 bg-cm-amber-light border-b border-cm-amber/20">
                  <p className="text-xs text-cm-amber">💡 {currentExercise?.hint || '暂无提示'}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="h-[60vh] xl:h-auto xl:flex-1 xl:min-h-0 overflow-hidden p-1">
            <CodeEditor
              initialValue={code}
              language={language || 'python'}
              onChange={(value) => setCode(value || '')}
              height="100%"
            />
          </div>

          {/* 本地运行结果 */}
          {localError && (
            <div className="border-t border-cm-red/30 bg-cm-red/10 px-4 py-2.5 text-sm text-cm-red">
              {localError}
            </div>
          )}
          {localResult && (
            <div className="border-t border-cm-border bg-cm-card-alt max-h-56 overflow-y-auto">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-cm-border bg-cm-card">
                <Terminal size={14} className="text-cm-muted" />
                <span className="text-xs font-medium text-cm-muted">
                  运行结果 ({localResult.success ? '成功' : '失败'}) · {localResult.execTime} · 退出码 {localResult.exitCode}
                </span>
              </div>
              <div className="p-4 space-y-2">
                {localResult.stdout && (
                  <pre className="text-sm text-cm-text font-mono whitespace-pre-wrap">{localResult.stdout}</pre>
                )}
                {localResult.stderr && (
                  <pre className="text-sm text-cm-red font-mono whitespace-pre-wrap">{localResult.stderr}</pre>
                )}
                {!localResult.stdout && !localResult.stderr && (
                  <p className="text-sm text-cm-muted italic">(无输出)</p>
                )}
              </div>
            </div>
          )}

          {/* AI 审查结果 */}
          {output && (
            <div className="border-t border-cm-border bg-cm-card-alt p-4 max-h-48 overflow-y-auto">
              <div className="text-xs text-cm-muted mb-2">AI 审查结果</div>
              <pre className="text-sm text-cm-text font-mono whitespace-pre-wrap">{output}</pre>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="border-t border-cm-border bg-cm-card px-4 py-3 lg:relative lg:px-6">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <button
            onClick={() => dayNum > 1 && navigate(`/learn/${language}/day/${dayNum - 1}`)}
            disabled={dayNum <= 1}
            className="flex items-center gap-2 rounded-xl border border-cm-border px-4 py-2 text-sm text-cm-muted hover:border-cm-accent/50 hover:text-cm-accent disabled:opacity-30"
          >
            <ChevronLeft size={16} /> 上一课
          </button>
          <button onClick={handleComplete} disabled={isCompleted}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
              isCompleted ? 'bg-cm-green-light text-cm-green' : 'bg-cm-accent text-white shadow-accent hover:brightness-110'
            }`}>
            <CheckCircle size={18} />
            {isCompleted ? '已完成 ✓' : '标记完成'}
          </button>
          <button
            onClick={() => navigate(`/learn/${language}/day/${dayNum + 1}`)}
            className="flex items-center gap-2 rounded-xl border border-cm-border px-4 py-2 text-sm text-cm-muted hover:border-cm-accent/50 hover:text-cm-accent"
          >
            下一课 <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

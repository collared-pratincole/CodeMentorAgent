import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, CheckCircle, Lightbulb, Play, Send,
  Sparkles, Trophy, Loader2
} from 'lucide-react'
import { useLearningStore, type LessonExercise } from '@/stores/useLearningStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { getLanguageById } from '@/data/languages'
import { createProvider } from '@/services/ai'
import { buildDailyLessonPrompt, buildCodeReviewPrompt } from '@/utils/promptBuilder'
import { parseAIResponseRobust } from '@/utils/aiParser'
import { isDailyLesson, isCodeReview, type DailyLessonOutput, type LessonSection, type CodeReviewOutput } from '@/types/ai-output'
import CodeEditor from '@/components/editor/CodeEditor'
import GlowCard from '@/components/common/GlowCard'
import BrandIcon from '@/components/common/BrandIcon'

export default function DailyLesson() {
  const { language, dayId } = useParams()
  const navigate = useNavigate()
  const {
    profile, learningPath, currentDay, completedDays, completeDay, addXP,
    currentLessonSections, currentExercise, currentLessonDay,
    setLessonData, clearLessonData
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
  const [showHint, setShowHint] = useState(false)
  const [codeReviewing, setCodeReviewing] = useState(false)

  // 用于防止重复加载同一天的课程
  const loadingRef = useRef(false)

  // 加载课程内容
  useEffect(() => {
    // 如果当前 store 中已有该天的课程数据，直接使用，不重复加载
    if (currentLessonDay === dayNum && currentLessonSections.length > 0) {
      if (currentExercise) {
        setCode(currentExercise.starterCode)
      }
      return
    }

    // 防止并发加载
    if (loadingRef.current) return

    loadLesson()
  }, [dayNum, language])

  const loadLesson = async () => {
    const activeModel = getActiveModel()
    if (!activeModel || !profile || !learningPath) {
      setError('请先在设置中配置 AI 模型和 API Key，课程内容将由 AI 动态生成')
      return
    }

    loadingRef.current = true
    setLoading(true)
    setError('')
    // 加载新课程前清除旧数据
    clearLessonData()

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
      await provider.sendMessage(
        [{ role: 'user', content: prompt }],
        activeModel.apiKey,
        (chunk) => { fullResponse += chunk }
      )

      console.log('[DailyLesson] AI 返回完成，长度:', fullResponse.length)

      // 解析标准 JSON
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

      // 存入 Zustand store，防止组件重渲染丢失
      setLessonData(parsed.sections, exercise, dayNum)
      setCode(exercise.starterCode)
    } catch (err: any) {
      console.error('[DailyLesson] 加载课程失败:', err)
      setError('加载课程失败：' + err.message)
    } finally {
      setLoading(false)
      loadingRef.current = false
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
        activeModel.apiKey,
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
    if (!code.trim() || (currentExercise && code.trim().length <= currentExercise.starterCode.length)) {
      setOutput('请先完成代码练习再提交')
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
        activeModel.apiKey,
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
        if (!first || c.index < first.index) first = c
      }
      if (codeMatch && codeMatch.index !== undefined) {
        const c = { index: codeMatch.index, length: codeMatch[0].length, content: <code key={`c-${key++}`} className="px-1.5 py-0.5 rounded-lg bg-cm-card-alt text-cm-amber text-xs font-mono">{codeMatch[1]}</code> }
        if (!first || c.index < first.index) first = c
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

      {/* Header */}
      <div className="border-b border-cm-border bg-cm-card px-4 py-3 sm:px-6 sm:py-4">
        <div className="max-w-7xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full overflow-hidden">
        {/* Knowledge Panel */}
        <div className="w-full border-b border-cm-border p-4 overflow-y-auto lg:w-[60%] lg:border-b-0 lg:border-r lg:p-6 lg:max-h-[calc(100vh-8rem)]">
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
        <div className="flex w-full flex-col bg-cm-bg lg:w-[40%] lg:max-h-[calc(100vh-8rem)] overflow-hidden">
          <div className="p-3 border-b border-cm-border flex items-center justify-between bg-cm-card sm:p-4">
            <span className="text-sm font-semibold text-cm-text">✏️ 代码练习</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowHint(!showHint)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-cm-amber-light text-cm-amber">
                <Lightbulb size={14} /> 提示
              </button>
              <button onClick={handleRun} disabled={codeReviewing}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-cm-green-light text-cm-green disabled:opacity-50">
                {codeReviewing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} 审查
              </button>
              <button onClick={handleSubmit} disabled={codeReviewing}
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

          <div className="flex-1 min-h-[300px] lg:min-h-0 overflow-hidden p-1">
            <CodeEditor
              initialValue={code}
              language={language || 'python'}
              onChange={(value) => setCode(value || '')}
              height="100%"
            />
          </div>

          {output && (
            <div className="border-t border-cm-border bg-cm-card-alt p-4 max-h-48 overflow-y-auto">
              <div className="text-xs text-cm-muted mb-2">输出</div>
              <pre className="text-sm text-cm-text font-mono whitespace-pre-wrap">{output}</pre>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="border-t border-cm-border bg-cm-card px-4 py-3 lg:relative lg:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
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

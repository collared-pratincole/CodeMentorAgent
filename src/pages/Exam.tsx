import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardCheck,
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Trophy,
  Clock,
  Zap,
  ChevronRight,
  ChevronLeft,
  Lock,
  Calendar,
  Flame,
  TrendingUp,
  BookOpen,
  Target,
} from 'lucide-react'
import { useUserStore } from '@/stores/useUserStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTaskQueueStore } from '@/stores/useTaskQueueStore'
import { useLearningStore } from '@/stores/useLearningStore'
import {
  listExams,
  getExam,
  createExam,
  deleteExam,
  submitExam,
  type Exam,
} from '@/services/api'
import { createProvider } from '@/services/ai'
import { buildExamPrompt, buildSubjectiveGradingPrompt, type SubjectiveGradingItem } from '@/utils/promptBuilder'
import { parseAIResponseRobust } from '@/utils/aiParser'
import GlowCard from '@/components/common/GlowCard'

type View = 'list' | 'take' | 'result'
type Tab = 'stage' | 'monthly'

const DIFFICULTY_LABELS: Record<string, { label: string; color: string }> = {
  easy: { label: '基础', color: 'text-cm-green' },
  medium: { label: '中等', color: 'text-cm-amber' },
  hard: { label: '挑战', color: 'text-cm-red' },
}

const MONTHLY_CATEGORY_PREFIX = '月度考试-'

function monthlyCategory(month: number, language: string) {
  return `${MONTHLY_CATEGORY_PREFIX}第${month}月-${language}`
}

function isMonthlyExam(exam: Exam) {
  return exam.category?.startsWith(MONTHLY_CATEGORY_PREFIX)
}

function extractMonthFromCategory(category: string): number | null {
  const match = category?.match(/第(\d+)月-/)
  return match ? parseInt(match[1], 10) : null
}

export default function ExamPage() {
  const { examId } = useParams<{ examId?: string }>()
  const navigate = useNavigate()
  const { currentUserId } = useUserStore()
  const getActiveModel = useSettingsStore((s) => s.getActiveModel)

  const [view, setView] = useState<View>('list')
  const [activeTab, setActiveTab] = useState<Tab>('stage')
  const [exams, setExams] = useState<Exam[]>([])
  const [currentExam, setCurrentExam] = useState<Exam | null>(null)
  const [loading, setLoading] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 考试作答状态：选择题存索引(number)，简答/代码题存文本(string)
  const [answers, setAnswers] = useState<Record<string, number | string>>({})
  const [currentQIdx, setCurrentQIdx] = useState(0)
  const [startTime, setStartTime] = useState<number>(0)
  const [examResult, setExamResult] = useState<any>(null)
  const [grading, setGrading] = useState(false)        // 主观题 AI 评分中
  const [gradingError, setGradingError] = useState<string | null>(null)

  // 加载考试列表
  const loadExams = useCallback(async () => {
    if (!currentUserId) return
    setLoading(true)
    try {
      const data = await listExams(currentUserId)
      setExams(data)
    } catch {
      setExams([])
    } finally {
      setLoading(false)
    }
  }, [currentUserId])

  useEffect(() => {
    loadExams()
  }, [loadExams])

  // 如果 URL 有 examId，加载该考试
  useEffect(() => {
    if (examId && currentUserId) {
      getExam(currentUserId, examId).then((exam) => {
        if (exam) {
          setCurrentExam(exam)
          setView('take')
          setAnswers({})
          setCurrentQIdx(0)
          setStartTime(Date.now())
          setExamResult(null)
        }
      })
    } else {
      setView('list')
      setCurrentExam(null)
    }
  }, [examId, currentUserId])

  // 开始考试
  const handleStartExam = (exam: Exam) => {
    setCurrentExam(exam)
    setView('take')
    setAnswers({})
    setCurrentQIdx(0)
    setStartTime(Date.now())
    setExamResult(null)
    navigate(`/exam/${exam.id}`)
  }

  // 提交考试
  const handleSubmit = async () => {
    if (!currentUserId || !currentExam) return
    const timeSpent = Math.round((Date.now() - startTime) / 1000)
    try {
      const result = await submitExam(currentUserId, currentExam.id, answers, timeSpent)
      if (!result) return

      const examRes = result.result
      setExamResult(examRes)
      setView('result')

      // 如果有主观题，调用 AI 评分
      const subjectives = examRes.subjectiveQuestions || []
      if (subjectives.length > 0) {
        await gradeSubjectives(examRes, subjectives)
      }
    } catch (err: any) {
      setError(err?.message || '提交失败')
    }
  }

  // AI 评分主观题（简答/代码实操）
  const gradeSubjectives = async (examRes: any, subjectives: any[]) => {
    const activeModel = getActiveModel()
    if (!activeModel) {
      setGradingError('未配置 AI 模型，请对照参考答案自评')
      return
    }
    setGrading(true)
    setGradingError(null)
    try {
      const items: SubjectiveGradingItem[] = subjectives.map((sq: any) => ({
        questionId: sq.questionId,
        type: sq.type,
        question: sq.question,
        userAnswer: sq.userAnswer || '',
        referenceAnswer: sq.referenceAnswer || '',
        keywords: sq.keywords || [],
        points: sq.points,
      }))
      const provider = createProvider(activeModel.baseUrl, activeModel.model)
      const prompt = buildSubjectiveGradingPrompt(items)
      let fullResponse = ''
      await provider.sendMessage(
        [{ role: 'user', content: prompt }],
        { userId: useUserStore.getState().currentUserId!, modelId: activeModel.id },
        (chunk) => { fullResponse += chunk },
      )
      const parsed = parseAIResponseRobust<{ gradings: any[] }>(fullResponse, { gradings: [] })
      const gradings = Array.isArray(parsed?.gradings) ? parsed.gradings : []

      // 把评分合并到 subjectiveQuestions，并重算总分
      let subjectiveScore = 0
      const mergedSubjectives = subjectives.map((sq: any) => {
        const g = gradings.find((x: any) => x.questionId === sq.questionId)
        if (g) {
          const sc = Math.max(0, Math.min(sq.points, Number(g.score) || 0))
          subjectiveScore += sc
          return {
            ...sq,
            aiScore: sc,
            aiComment: g.comment || '',
            matchedKeywords: Array.isArray(g.matchedKeywords) ? g.matchedKeywords : [],
          }
        }
        return { ...sq, aiScore: null, aiComment: '评分失败', matchedKeywords: [] }
      })

      const newScore = (examRes.score || 0) + subjectiveScore
      const totalPoints = (examRes.totalPoints || 0) + (examRes.subjectivePoints || 0)
      setExamResult({
        ...examRes,
        subjectiveQuestions: mergedSubjectives,
        subjectiveScore,
        score: newScore,
        totalPoints,
        percentage: totalPoints > 0 ? Math.round((newScore / totalPoints) * 100) : 0,
      })
    } catch (err: any) {
      setGradingError(err?.message || 'AI 评分失败，请对照参考答案自评')
    } finally {
      setGrading(false)
    }
  }

  // 删除考试
  const handleDelete = async (id: string) => {
    if (!currentUserId) return
    await deleteExam(currentUserId, id)
    setExams(exams.filter((e) => e.id !== id))
  }

  // 返回列表
  const handleBackToList = () => {
    setView('list')
    setCurrentExam(null)
    setExamResult(null)
    navigate('/exam')
  }

  // ===== 列表视图 =====
  if (view === 'list') {
    const stageExams = exams.filter((e) => !isMonthlyExam(e))
    const monthlyExams = exams.filter((e) => isMonthlyExam(e))

    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        {/* Tab 切换 */}
        <div className="flex gap-1 border-b border-cm-border">
          <button
            onClick={() => setActiveTab('stage')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'stage'
                ? 'border-cm-accent text-cm-accent'
                : 'border-transparent text-cm-muted hover:text-cm-text'
            }`}
          >
            <ClipboardCheck className="h-4 w-4" />
            阶段考试
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'monthly'
                ? 'border-cm-accent text-cm-accent'
                : 'border-transparent text-cm-muted hover:text-cm-text'
            }`}
          >
            <Calendar className="h-4 w-4" />
            月度考试
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-cm-accent" />
          </div>
        ) : activeTab === 'stage' ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-cm-text">
                  <ClipboardCheck className="h-7 w-7 text-cm-accent" />
                  阶段考试
                </h1>
                <p className="mt-1 text-sm text-cm-muted">
                  AI 自动生成考卷，检验你的学习成果
                </p>
              </div>
              <button
                onClick={() => setShowGenerate(true)}
                className="flex items-center gap-2 rounded-xl bg-cm-accent px-5 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                生成考卷
              </button>
            </div>

            {stageExams.length === 0 ? (
              <GlowCard className="p-12 text-center">
                <ClipboardCheck className="mx-auto h-12 w-12 text-cm-muted/40 mb-4" />
                <p className="text-lg font-medium text-cm-muted">还没有考试</p>
                <p className="mt-1 text-sm text-cm-muted/70">点击"生成考卷"让 AI 为你出题</p>
              </GlowCard>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {stageExams.map((exam) => {
                  const bestResult = exam.results?.reduce?.(
                    (best: any, r: any) => (!best || r.percentage > best.percentage ? r : best),
                    null,
                  )
                  const diff = DIFFICULTY_LABELS[exam.difficulty] || DIFFICULTY_LABELS.medium
                  return (
                    <GlowCard key={exam.id} className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-cm-text">{exam.title}</h3>
                          <p className="mt-1 text-sm text-cm-muted">{exam.description}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                            <span className="rounded-full bg-cm-card-alt px-2.5 py-1 text-cm-text-secondary">
                              {exam.category}
                            </span>
                            <span className={`font-medium ${diff.color}`}>{diff.label}</span>
                            <span className="text-cm-muted">{exam.questions.length} 题</span>
                            {exam.results?.length > 0 && (
                              <span className="text-cm-muted">
                                已考 {exam.results.length} 次
                              </span>
                            )}
                          </div>
                          {bestResult && (
                            <div className="mt-3 flex items-center gap-2 text-sm">
                              <Trophy className="h-4 w-4 text-cm-amber" />
                              <span className="text-cm-muted">最佳成绩：</span>
                              <span
                                className={`font-bold ${
                                  bestResult.percentage >= 60 ? 'text-cm-green' : 'text-cm-red'
                                }`}
                              >
                                {bestResult.percentage}%
                              </span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(exam.id)}
                          className="rounded-lg p-1.5 text-cm-muted transition-colors hover:bg-cm-red/10 hover:text-cm-red"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <button
                        onClick={() => handleStartExam(exam)}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cm-accent-light py-2.5 text-sm font-medium text-cm-accent transition-colors hover:bg-cm-accent/20"
                      >
                        开始考试
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </GlowCard>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <MonthlyExamView
            exams={monthlyExams}
            onGenerated={(exam) => setExams([...exams, exam])}
            onStartExam={handleStartExam}
            onDelete={handleDelete}
            getActiveModel={getActiveModel}
            currentUserId={currentUserId}
          />
        )}

        <AnimatePresence>
          {showGenerate && (
            <GenerateExamModal
              onClose={() => {
                setShowGenerate(false)
                // 关闭弹窗后刷新列表，确保后台保存的考试被加载
                loadExams()
              }}
              onGenerated={(exam) => {
                setExams([...exams, exam])
                setShowGenerate(false)
                handleStartExam(exam)
              }}
              getActiveModel={getActiveModel}
              currentUserId={currentUserId}
            />
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ===== 考试作答视图 =====
  if (view === 'take' && currentExam) {
    const question = currentExam.questions[currentQIdx]
    // 已答计数：选择题判断 !== undefined；文本题判断非空字符串
    const isAnswered = (qid: string) => {
      const a = answers[qid]
      if (a === undefined || a === null) return false
      if (typeof a === 'string') return a.trim() !== ''
      return true
    }
    const answeredCount = currentExam.questions.filter((q) => isAnswered(q.id)).length
    const totalQuestions = currentExam.questions.length
    const isLast = currentQIdx === totalQuestions - 1
    const qType = question.type || 'multiple_choice'
    const isObjective = qType === 'multiple_choice' || qType === 'true_false'
    const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
      multiple_choice: { label: '选择题', cls: 'bg-cm-accent/10 text-cm-accent' },
      true_false: { label: '判断题', cls: 'bg-cm-accent/10 text-cm-accent' },
      short_answer: { label: '简答题', cls: 'bg-cm-purple/10 text-cm-purple' },
      code_practice: { label: '代码实操', cls: 'bg-cm-amber/10 text-cm-amber' },
    }
    const badge = TYPE_BADGE[qType] || TYPE_BADGE.multiple_choice

    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {/* 顶部信息 */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBackToList}
            className="flex items-center gap-1.5 text-sm text-cm-muted hover:text-cm-text"
          >
            <ArrowLeft className="h-4 w-4" />
            退出
          </button>
          <div className="flex items-center gap-4 text-sm text-cm-muted">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {Math.floor((Date.now() - startTime) / 60000)} 分钟
            </span>
            <span>
              {answeredCount} / {totalQuestions} 已答
            </span>
          </div>
        </div>

        {/* 进度条 */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-cm-card-alt">
          <motion.div
            className="h-full rounded-full bg-cm-accent"
            animate={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* 题目导航 */}
        <div className="flex flex-wrap gap-2">
          {currentExam.questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => setCurrentQIdx(i)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                i === currentQIdx
                  ? 'bg-cm-accent text-white'
                  : isAnswered(q.id)
                    ? 'bg-cm-green/20 text-cm-green'
                    : 'bg-cm-card-alt text-cm-muted'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {/* 题目内容 */}
        <GlowCard className="p-6" key={question.id}>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-cm-muted">
              第 {currentQIdx + 1} 题 / 共 {totalQuestions} 题
            </span>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}>
                {badge.label}
              </span>
              <span className="rounded-full bg-cm-card-alt px-2.5 py-1 text-xs text-cm-text-secondary">
                {question.points} 分
              </span>
            </div>
          </div>
          <h2 className="mb-5 text-lg font-medium leading-relaxed text-cm-text">
            {question.question}
          </h2>

          {/* 选择题 / 判断题 */}
          {isObjective && (
            <div className="space-y-3">
              {question.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => setAnswers({ ...answers, [question.id]: idx })}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                    answers[question.id] === idx
                      ? 'border-cm-accent bg-cm-accent-light text-cm-accent'
                      : 'border-cm-border bg-cm-card-alt text-cm-text-secondary hover:border-cm-accent/40'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      answers[question.id] === idx
                        ? 'bg-cm-accent text-white'
                        : 'bg-cm-card text-cm-muted'
                    }`}
                  >
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span>{option}</span>
                </button>
              ))}
            </div>
          )}

          {/* 简答题 */}
          {qType === 'short_answer' && (
            <div className="space-y-3">
              <textarea
                value={(typeof answers[question.id] === 'string' ? answers[question.id] : '') as string}
                onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                placeholder="请在此输入你的答案（提交后可对照参考答案自评）"
                rows={8}
                className="w-full resize-y rounded-xl border border-cm-border bg-cm-card-alt px-4 py-3 text-sm text-cm-text outline-none focus:border-cm-accent"
              />
              <p className="text-xs text-cm-muted">
                提示：简答题不参与自动判分，提交后可查看参考答案与关键词进行自评。
              </p>
            </div>
          )}

          {/* 代码实操题 */}
          {qType === 'code_practice' && (
            <div className="space-y-3">
              {question.expectedOutput && (
                <div className="rounded-xl border border-cm-border bg-cm-card-alt px-4 py-3 text-sm">
                  <div className="mb-1 text-xs font-medium text-cm-muted">预期输出 / 行为</div>
                  <div className="text-cm-text-secondary">{question.expectedOutput}</div>
                </div>
              )}
              {question.starterCode && (
                <div className="rounded-xl border border-cm-border bg-cm-card-alt px-4 py-3">
                  <div className="mb-1.5 text-xs font-medium text-cm-muted">起始代码框架</div>
                  <pre className="overflow-x-auto text-xs text-cm-text-secondary">
                    <code>{question.starterCode}</code>
                  </pre>
                </div>
              )}
              <textarea
                value={(typeof answers[question.id] === 'string' ? answers[question.id] : '') as string}
                onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                placeholder="在此输入你的代码实现（提交后可查看参考实现进行自评）"
                rows={10}
                className="w-full resize-y rounded-xl border border-cm-border bg-cm-card-alt px-4 py-3 font-mono text-sm text-cm-text outline-none focus:border-cm-accent"
              />
              {question.hint && (
                <p className="text-xs text-cm-muted">
                  <span className="font-medium">提示：</span>{question.hint}
                </p>
              )}
              <p className="text-xs text-cm-muted">
                提示：代码实操题不参与自动判分，提交后可查看参考实现进行自评。
              </p>
            </div>
          )}
        </GlowCard>

        {/* 底部导航 */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentQIdx(Math.max(0, currentQIdx - 1))}
            disabled={currentQIdx === 0}
            className="flex items-center gap-1.5 rounded-xl border border-cm-border px-5 py-2.5 text-sm font-medium text-cm-text-secondary transition-colors hover:bg-cm-card-alt disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
            上一题
          </button>

          {isLast ? (
            <button
              onClick={handleSubmit}
              disabled={answeredCount === 0}
              className="flex items-center gap-2 rounded-xl bg-cm-accent px-6 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90 disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" />
              提交考试
            </button>
          ) : (
            <button
              onClick={() => setCurrentQIdx(Math.min(totalQuestions - 1, currentQIdx + 1))}
              className="flex items-center gap-1.5 rounded-xl bg-cm-accent px-5 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90"
            >
              下一题
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-cm-red/30 bg-cm-red/10 px-4 py-3 text-sm text-cm-red">
            {error}
          </div>
        )}
      </div>
    )
  }

  // ===== 结果视图 =====
  if (view === 'result' && currentExam && examResult) {
    const passed = examResult.percentage >= 60
    const examMonth = isMonthlyExam(currentExam)
      ? extractMonthFromCategory(currentExam.category)
      : null
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <button
          onClick={handleBackToList}
          className="flex items-center gap-1.5 text-sm text-cm-muted hover:text-cm-text"
        >
          <ArrowLeft className="h-4 w-4" />
          返回考试列表
        </button>

        {/* 成绩卡片 */}
        <GlowCard className="overflow-hidden p-0">
          <div
            className={`p-8 text-center ${passed ? 'bg-cm-green/10' : 'bg-cm-red/10'}`}
          >
            {grading ? (
              <>
                <Loader2 className="mx-auto mb-4 h-16 w-16 animate-spin text-cm-accent" />
                <h2 className="text-2xl font-bold text-cm-text">AI 正在评分主观题...</h2>
                <p className="mt-2 text-sm text-cm-muted">
                  客观题已自动判分，正在由 AI 对简答题 / 代码实操题进行评分，请稍候
                </p>
                <div className="mt-4 text-sm text-cm-muted">
                  客观题暂得分：{examResult.score} / {examResult.totalPoints}
                </div>
              </>
            ) : (
              <>
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', duration: 0.8 }}
                  className="mx-auto mb-4"
                >
                  {passed ? (
                    <Trophy className="h-16 w-16 text-cm-amber" />
                  ) : (
                    <XCircle className="h-16 w-16 text-cm-red" />
                  )}
                </motion.div>
                <h2 className="text-3xl font-bold text-cm-text">
                  {examResult.percentage} 分
                </h2>
                <p className="mt-2 text-sm text-cm-muted">
                  {passed ? '恭喜通过！' : '继续努力，下次一定可以！'}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-6 text-sm">
                  <div>
                    <span className="text-cm-muted">得分</span>
                    <span className="ml-2 font-bold text-cm-text">
                      {examResult.score} / {examResult.totalPoints}
                    </span>
                  </div>
                  <div>
                    <span className="text-cm-muted">用时</span>
                    <span className="ml-2 font-bold text-cm-text">
                      {Math.floor(examResult.timeSpent / 60)}分{examResult.timeSpent % 60}秒
                    </span>
                  </div>
                  <div>
                    <span className="text-cm-muted">错误</span>
                    <span className="ml-2 font-bold text-cm-text">
                      {examResult.wrongCount} 题
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </GlowCard>

        {/* 月度考试：学习状态关联分析（评分完成后再展示，避免用不完整分数分析） */}
        {examMonth !== null && !grading && (
          <LearningStateAnalysis examResult={examResult} month={examMonth} />
        )}

        {/* 错题解析 */}
        {examResult.wrongQuestions?.length > 0 && (
          <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-cm-text">
              <XCircle className="h-5 w-5 text-cm-red" />
              错题解析
            </h3>
            {examResult.wrongQuestions.map((wq: any, i: number) => {
              const question = currentExam.questions.find((q) => q.id === wq.questionId)
              return (
                <GlowCard key={i} className="p-5">
                  <div className="mb-3">
                    <span className="text-xs text-cm-muted">第 {i + 1} 题</span>
                    <p className="mt-1 font-medium text-cm-text">{wq.question}</p>
                  </div>
                  {question && (
                    <div className="mb-3 space-y-1.5 text-sm">
                      {question.options.map((opt, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${
                            idx === wq.correctAnswer
                              ? 'bg-cm-green/10 text-cm-green'
                              : idx === wq.userAnswer
                                ? 'bg-cm-red/10 text-cm-red'
                                : 'text-cm-muted'
                          }`}
                        >
                          <span className="font-bold">{String.fromCharCode(65 + idx)}.</span>
                          <span>{opt}</span>
                          {idx === wq.correctAnswer && <CheckCircle2 className="ml-auto h-4 w-4" />}
                          {idx === wq.userAnswer && idx !== wq.correctAnswer && (
                            <XCircle className="ml-auto h-4 w-4" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {wq.explanation && (
                    <div className="rounded-lg bg-cm-card-alt px-4 py-3 text-sm text-cm-text-secondary">
                      <span className="font-medium text-cm-accent">解析：</span>
                      {wq.explanation}
                    </div>
                  )}
                </GlowCard>
              )
            })}
          </div>
        )}

        {/* 主观题（简答/代码实操）AI 评分结果 */}
        {examResult.subjectiveQuestions?.length > 0 && (
          <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-cm-text">
              <BookOpen className="h-5 w-5 text-cm-accent" />
              主观题 AI 评分
              <span className="text-sm font-normal text-cm-muted">
                共 {examResult.subjectiveQuestions.length} 题 / {examResult.subjectivePoints || 0} 分
              </span>
            </h3>

            {grading && (
              <div className="flex items-center gap-2 rounded-xl border border-cm-accent/30 bg-cm-accent-light px-4 py-3 text-sm text-cm-accent">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 正在评分中，请稍候...
              </div>
            )}

            {gradingError && !grading && (
              <div className="rounded-xl bg-cm-amber/10 px-4 py-3 text-sm text-cm-amber">
                {gradingError}。下方为参考答案，请自行对照评估。
              </div>
            )}

            {!grading && (
              <p className="text-xs text-cm-muted">
                {gradingError
                  ? 'AI 评分未成功，请参考下方参考答案与关键词自评。'
                  : '以下为主观题作答与 AI 评分结果，含评语与命中关键词。'}
              </p>
            )}

            {examResult.subjectiveQuestions.map((sq: any, i: number) => {
              const hasAiScore = sq.aiScore !== null && sq.aiScore !== undefined
              return (
                <GlowCard key={i} className="p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xs text-cm-muted">第 {i + 1} 题</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      sq.type === 'code_practice'
                        ? 'bg-cm-amber/10 text-cm-amber'
                        : 'bg-cm-purple/10 text-cm-purple'
                    }`}>
                      {sq.type === 'code_practice' ? '代码实操' : '简答题'}
                    </span>
                    <span className="text-xs text-cm-muted">满分 {sq.points} 分</span>
                    {/* AI 评分徽章 */}
                    {hasAiScore && (
                      <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-bold ${
                        sq.aiScore >= sq.points * 0.8
                          ? 'bg-cm-green/20 text-cm-green'
                          : sq.aiScore >= sq.points * 0.6
                            ? 'bg-cm-amber/20 text-cm-amber'
                            : 'bg-cm-red/20 text-cm-red'
                      }`}>
                        AI 评分：{sq.aiScore} / {sq.points}
                      </span>
                    )}
                  </div>
                  <p className="mb-3 font-medium text-cm-text">{sq.question}</p>

                  {/* 用户作答 */}
                  <div className="mb-3">
                    <div className="mb-1 text-xs font-medium text-cm-muted">你的作答</div>
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-cm-card-alt px-4 py-3 text-sm text-cm-text-secondary">
                      {sq.userAnswer || <span className="text-cm-muted italic">（未作答）</span>}
                    </pre>
                  </div>

                  {/* AI 评语 */}
                  {hasAiScore && sq.aiComment && (
                    <div className="mb-3 rounded-lg bg-cm-accent-light px-4 py-3 text-sm text-cm-text-secondary">
                      <span className="font-medium text-cm-accent">AI 评语：</span>
                      {sq.aiComment}
                    </div>
                  )}

                  {/* 命中关键词 */}
                  {hasAiScore && sq.matchedKeywords?.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-cm-muted">命中关键词：</span>
                      {sq.matchedKeywords.map((kw: string, ki: number) => (
                        <span key={ki} className="rounded-full bg-cm-green/10 px-2 py-0.5 text-xs text-cm-green">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 参考答案（评分失败降级时显示，或始终显示供对照） */}
                  {sq.referenceAnswer && (
                    <div className="mb-3">
                      <div className="mb-1 text-xs font-medium text-cm-green">参考答案</div>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-cm-green/10 px-4 py-3 text-sm text-cm-text-secondary">
                        {sq.referenceAnswer}
                      </pre>
                    </div>
                  )}

                  {/* 解析 */}
                  {sq.explanation && (
                    <div className="rounded-lg bg-cm-card-alt px-4 py-3 text-sm text-cm-text-secondary">
                      <span className="font-medium text-cm-accent">解析：</span>
                      {sq.explanation}
                    </div>
                  )}
                </GlowCard>
              )
            })}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => handleStartExam(currentExam)}
            disabled={grading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cm-accent px-5 py-3 text-sm font-medium text-white shadow-accent hover:opacity-90 disabled:opacity-40"
          >
            <Zap className="h-4 w-4" />
            重新考试
          </button>
          <button
            onClick={handleBackToList}
            disabled={grading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cm-border px-5 py-3 text-sm font-medium text-cm-text-secondary hover:bg-cm-card-alt disabled:opacity-40"
          >
            返回列表
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ===== 月度考试视图 =====
function MonthlyExamView({
  exams,
  onGenerated,
  onStartExam,
  onDelete,
  getActiveModel,
  currentUserId,
}: {
  exams: Exam[]
  onGenerated: (exam: Exam) => void
  onStartExam: (exam: Exam) => void
  onDelete: (id: string) => void
  getActiveModel: () => any
  currentUserId: string | null
}) {
  const { profile, learningPath, currentDay, completedDays, lessonsByDay } = useLearningStore()

  const months = learningPath?.months || []
  const language = profile?.language || ''

  const [selectedMonth, setSelectedMonth] = useState(() =>
    Math.max(1, Math.ceil(currentDay / 30)),
  )
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [fakeProgress, setFakeProgress] = useState(0)

  // 伪进度条：只往前走不回退
  useEffect(() => {
    if (!generating) return
    setFakeProgress(0)
    const timer = setInterval(() => {
      setFakeProgress((prev) => {
        if (prev >= 90) return prev
        const inc = prev < 30 ? 5 : prev < 60 ? 3 : prev < 80 ? 1.5 : 0.5
        return Math.min(prev + inc, 90)
      })
    }, 800)
    return () => clearInterval(timer)
  }, [generating])

  const monthData = months.find((m) => m.month === selectedMonth)
  const startDay = (selectedMonth - 1) * 30 + 1
  const monthDays = Array.from({ length: 30 }, (_, i) => startDay + i)
  const completedInMonth = monthDays.filter((d) => completedDays.includes(d))
  const completionRate = (completedInMonth.length / 30) * 100
  const isUnlocked = monthDays.every((d) => completedDays.includes(d))
  const remainingDays = 30 - completedInMonth.length

  const monthExams = exams.filter(
    (e) => e.category === monthlyCategory(selectedMonth, language),
  )

  const handlePrevMonth = () => {
    if (selectedMonth > 1) {
      setSelectedMonth(selectedMonth - 1)
      setError(null)
    }
  }
  const handleNextMonth = () => {
    if (selectedMonth < months.length) {
      setSelectedMonth(selectedMonth + 1)
      setError(null)
    }
  }

  const handleGenerate = async () => {
    if (!monthData) {
      setError('该月份无学习计划数据')
      return
    }
    const activeModel = getActiveModel()
    if (!activeModel) {
      setError('请先在设置中配置 AI 模型')
      return
    }
    if (!currentUserId) {
      setError('请先登录')
      return
    }

    setGenerating(true)
    setError(null)
    setStreamingText('')

    const { createTask, updateTask } = useTaskQueueStore.getState()
    const task = await createTask({
      type: 'lesson',
      title: `生成第${selectedMonth}月月度考卷`,
    })

    try {
      const provider = createProvider(activeModel.baseUrl, activeModel.model)
      const topic = monthData.topics.join('、')

      // 拼入该月所有每日课程的主题（sections 的 heading），不拼全部内容避免上下文爆炸
      const monthLessonTopics: string[] = []
      for (let day = startDay; day <= startDay + 29; day++) {
        const key = `${language}-${day}`
        const lesson = lessonsByDay[key]
        if (lesson && Array.isArray(lesson.sections)) {
          const headings = lesson.sections
            .map((s: any) => s.heading)
            .filter((h: string) => h && h.trim())
          if (headings.length > 0) {
            monthLessonTopics.push(`第${day}天：${headings.join('、')}`)
          }
        }
      }
      const lessonTopicsText = monthLessonTopics.length > 0
        ? `\n本月每日课程实际教学主题（请紧密围绕这些主题出题）：\n${monthLessonTopics.join('\n')}`
        : '\n（本月每日课程尚未生成，请基于月度计划主题出题）'
      const context = `${monthData.title}${lessonTopicsText}`

      // 月考固定题量：30 选择 + 2 简答 + 2 代码实操
      const prompt = buildExamPrompt({
        topic,
        difficulty: 'medium',
        count: 30,
        shortAnswerCount: 2,
        codePracticeCount: 2,
        context,
      })

      let chunkCount = 0
      const fullContent = await provider.sendMessage(
        [{ role: 'user', content: prompt }],
        { userId: useUserStore.getState().currentUserId!, modelId: activeModel.id },
        (chunk) => {
          setStreamingText((prev) => prev + chunk)
          chunkCount++
          if (task && chunkCount % 10 === 0) {
            updateTask(task.id, { progress: Math.min(chunkCount * 3, 80) })
          }
        },
      )

      const parsed = parseAIResponseRobust<any>(fullContent, null)

      if (parsed && parsed.questions && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        const exam = await createExam(currentUserId, {
          title: parsed.title || `第${selectedMonth}月月度考试`,
          description: parsed.description || `${monthData.title} 月度测验`,
          category: monthlyCategory(selectedMonth, language),
          difficulty: 'medium',
          questions: parsed.questions,
        })

        if (exam) {
          setFakeProgress(100)
          if (task) updateTask(task.id, { status: 'completed', progress: 100 })
          onGenerated(exam)
        } else {
          throw new Error('保存考试失败')
        }
      } else {
        throw new Error('AI 返回的内容无法解析为考试题目')
      }
    } catch (err: any) {
      setError(err?.message || '生成失败，请重试')
      if (task) updateTask(task.id, { status: 'failed', error: err?.message })
    } finally {
      setGenerating(false)
    }
  }

  // 未生成学习路径
  if (!learningPath || !profile) {
    return (
      <GlowCard className="p-12 text-center">
        <Calendar className="mx-auto h-12 w-12 text-cm-muted/40 mb-4" />
        <p className="text-lg font-medium text-cm-muted">暂无学习路径</p>
        <p className="mt-1 text-sm text-cm-muted/70">
          请先在「学习」页面生成学习路径后再参加月度考试
        </p>
      </GlowCard>
    )
  }

  return (
    <div className="space-y-6">
      {/* 月份选择器 */}
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={handlePrevMonth}
          disabled={selectedMonth <= 1}
          className="rounded-lg p-2 text-cm-muted transition-colors hover:bg-cm-card-alt hover:text-cm-text disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-xl font-bold text-cm-text">
            <Calendar className="h-5 w-5 text-cm-accent" />
            第 {selectedMonth} 月
          </div>
          <p className="mt-1 text-sm text-cm-muted">{monthData?.title || '本月计划'}</p>
        </div>
        <button
          onClick={handleNextMonth}
          disabled={selectedMonth >= months.length}
          className="rounded-lg p-2 text-cm-muted transition-colors hover:bg-cm-card-alt hover:text-cm-text disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* 月份状态卡 */}
      <GlowCard className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {isUnlocked ? (
                <CheckCircle2 className="h-5 w-5 text-cm-green" />
              ) : (
                <Lock className="h-5 w-5 text-cm-muted" />
              )}
              <span className="font-medium text-cm-text">
                {isUnlocked ? '已解锁' : '未解锁'}
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-cm-muted">当月学习进度</span>
                <span className="font-medium text-cm-text">
                  {completedInMonth.length} / 30 天
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-cm-card-alt">
                <motion.div
                  className="h-full rounded-full bg-cm-accent"
                  animate={{ width: `${completionRate}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
            {!isUnlocked && (
              <p className="mt-3 text-sm text-cm-muted">
                还需完成 <span className="font-bold text-cm-amber">{remainingDays}</span>{' '}
                天的学习即可解锁本月考试
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-cm-accent">
              {Math.round(completionRate)}%
            </div>
            <div className="text-xs text-cm-muted">完成率</div>
          </div>
        </div>
      </GlowCard>

      {/* 锁定提示 */}
      {!isUnlocked ? (
        <GlowCard className="p-8 text-center">
          <Lock className="mx-auto h-10 w-10 text-cm-muted/40 mb-3" />
          <p className="font-medium text-cm-muted">月度考试未解锁</p>
          <p className="mt-1 text-sm text-cm-muted/70">
            完成本月全部 30 天学习后，即可参加月度考试检验学习成果
          </p>
        </GlowCard>
      ) : (
        <>
          {/* 生成按钮 */}
          <div className="flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 rounded-xl bg-cm-accent px-5 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {generating ? '生成中...' : '生成本月考卷'}
            </button>
          </div>

          {/* 生成进度 */}
          {generating && (
            <GlowCard className="p-5">
              <div className="flex items-center gap-2 text-sm text-cm-accent">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 正在基于本月学习内容出题... {Math.round(fakeProgress)}%
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-cm-accent/20">
                <div
                  className="h-full rounded-full bg-cm-accent transition-all duration-700 ease-out"
                  style={{ width: `${fakeProgress}%` }}
                />
              </div>
              {streamingText.length > 0 && (
                <p className="mt-2 text-xs text-cm-muted">
                  已接收 {streamingText.length} 字符
                </p>
              )}
            </GlowCard>
          )}

          {error && (
            <div className="rounded-xl border border-cm-red/30 bg-cm-red/10 px-4 py-3 text-sm text-cm-red">
              {error}
            </div>
          )}

          {/* 本月考卷列表 */}
          {monthExams.length === 0 ? (
            <GlowCard className="p-12 text-center">
              <ClipboardCheck className="mx-auto h-12 w-12 text-cm-muted/40 mb-4" />
              <p className="text-lg font-medium text-cm-muted">本月暂无考卷</p>
              <p className="mt-1 text-sm text-cm-muted/70">
                点击「生成本月考卷」让 AI 根据本月内容出题
              </p>
            </GlowCard>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {monthExams.map((exam) => {
                const bestResult = exam.results?.reduce?.(
                  (best: any, r: any) => (!best || r.percentage > best.percentage ? r : best),
                  null,
                )
                return (
                  <GlowCard key={exam.id} className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-cm-text">{exam.title}</h3>
                        <p className="mt-1 text-sm text-cm-muted">{exam.description}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                          <span className="rounded-full bg-cm-card-alt px-2.5 py-1 text-cm-text-secondary">
                            {exam.category}
                          </span>
                          <span className="text-cm-muted">{exam.questions.length} 题</span>
                          {exam.results?.length > 0 && (
                            <span className="text-cm-muted">
                              已考 {exam.results.length} 次
                            </span>
                          )}
                        </div>
                        {bestResult && (
                          <div className="mt-3 flex items-center gap-2 text-sm">
                            <Trophy className="h-4 w-4 text-cm-amber" />
                            <span className="text-cm-muted">最佳成绩：</span>
                            <span
                              className={`font-bold ${
                                bestResult.percentage >= 60
                                  ? 'text-cm-green'
                                  : 'text-cm-red'
                              }`}
                            >
                              {bestResult.percentage}%
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => onDelete(exam.id)}
                        className="rounded-lg p-1.5 text-cm-muted transition-colors hover:bg-cm-red/10 hover:text-cm-red"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => onStartExam(exam)}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cm-accent-light py-2.5 text-sm font-medium text-cm-accent transition-colors hover:bg-cm-accent/20"
                    >
                      开始考试
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </GlowCard>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ===== 学习状态关联分析（月度考试结果） =====
function LearningStateAnalysis({
  examResult,
  month,
}: {
  examResult: any
  month: number
}) {
  const { streak, completedDays, totalXP, level } = useLearningStore()

  const startDay = (month - 1) * 30 + 1
  const monthDays = Array.from({ length: 30 }, (_, i) => startDay + i)
  const completedInMonth = monthDays.filter((d) => completedDays.includes(d))
  const completionRate = (completedInMonth.length / 30) * 100

  const score = examResult.percentage

  let analysis: { summary: string; suggestion: string; level: 'excellent' | 'good' | 'warn' | 'bad' }
  if (score >= 90 && completionRate >= 90) {
    analysis = {
      summary: '学习投入与考试成果高度匹配，形成优秀闭环',
      suggestion: '保持当前学习节奏，可尝试挑战更高难度题目或拓展相关知识领域。',
      level: 'excellent',
    }
  } else if (score >= 60 && completionRate >= 80) {
    analysis = {
      summary: '学习状态稳定，考试成绩达标',
      suggestion: '针对错题查漏补缺，巩固薄弱知识点，争取下次拿高分。',
      level: 'good',
    }
  } else if (score >= 60 && completionRate < 80) {
    analysis = {
      summary: '考试通过，但学习完成率偏低',
      suggestion: '建议坚持每日学习，完整跟下来本月内容会让基础更扎实。',
      level: 'warn',
    }
  } else if (score < 60 && completionRate >= 80) {
    analysis = {
      summary: '学习完成度高但考试成绩不理想',
      suggestion: '说明知识点掌握不够深入，建议复盘错题、重读课程并加强理解。',
      level: 'warn',
    }
  } else {
    analysis = {
      summary: '学习与考试均有提升空间',
      suggestion: '建议先稳住每日学习节奏，把本月内容学完再来挑战。',
      level: 'bad',
    }
  }

  const levelColor = {
    excellent: 'text-cm-green',
    good: 'text-cm-green',
    warn: 'text-cm-amber',
    bad: 'text-cm-red',
  }[analysis.level]

  return (
    <GlowCard className="p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-cm-text">
        <TrendingUp className="h-5 w-5 text-cm-accent" />
        学习状态关联分析
      </h3>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-cm-card-alt p-3">
          <div className="flex items-center gap-1.5 text-xs text-cm-muted">
            <Flame className="h-3.5 w-3.5 text-cm-amber" />
            连续学习
          </div>
          <div className="mt-1 text-lg font-bold text-cm-text">{streak} 天</div>
        </div>
        <div className="rounded-xl bg-cm-card-alt p-3">
          <div className="flex items-center gap-1.5 text-xs text-cm-muted">
            <BookOpen className="h-3.5 w-3.5 text-cm-accent" />
            当月完成率
          </div>
          <div className="mt-1 text-lg font-bold text-cm-text">
            {Math.round(completionRate)}%
          </div>
        </div>
        <div className="rounded-xl bg-cm-card-alt p-3">
          <div className="flex items-center gap-1.5 text-xs text-cm-muted">
            <Target className="h-3.5 w-3.5 text-cm-purple" />
            总完成天数
          </div>
          <div className="mt-1 text-lg font-bold text-cm-text">{completedDays.length} 天</div>
        </div>
        <div className="rounded-xl bg-cm-card-alt p-3">
          <div className="flex items-center gap-1.5 text-xs text-cm-muted">
            <Zap className="h-3.5 w-3.5 text-cm-amber" />
            等级 / XP
          </div>
          <div className="mt-1 text-lg font-bold text-cm-text">
            Lv.{level} / {totalXP}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-cm-border bg-cm-card-alt p-4">
          <div className="text-xs text-cm-muted">考试成绩与学习状态对比</div>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex-1">
              <div className="mb-1 flex justify-between text-xs text-cm-muted">
                <span>学习完成率</span>
                <span>{Math.round(completionRate)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-cm-card">
                <div
                  className="h-full bg-cm-accent"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="mb-1 flex justify-between text-xs text-cm-muted">
                <span>考试得分</span>
                <span>{score}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-cm-card">
                <div
                  className={`h-full ${score >= 60 ? 'bg-cm-green' : 'bg-cm-red'}`}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-cm-border p-4">
          <div className={`text-sm font-medium ${levelColor}`}>{analysis.summary}</div>
          <p className="mt-1.5 text-sm text-cm-muted">{analysis.suggestion}</p>
        </div>
      </div>
    </GlowCard>
  )
}

// ===== AI 生成考试弹窗 =====
function GenerateExamModal({
  onClose,
  onGenerated,
  getActiveModel,
  currentUserId,
}: {
  onClose: () => void
  onGenerated: (exam: Exam) => void
  getActiveModel: () => any
  currentUserId: string | null
}) {
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [count, setCount] = useState(10)
  // 大题（主观题）数量 0-3，简答题与代码实操题各自独立
  const [shortAnswerCount, setShortAnswerCount] = useState(0)
  const [codePracticeCount, setCodePracticeCount] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [fakeProgress, setFakeProgress] = useState(0)

  // 伪进度条：每 800ms 递增，到 90% 停止，只往前走不回退
  useEffect(() => {
    if (!generating) return
    setFakeProgress(0)
    const timer = setInterval(() => {
      setFakeProgress((prev) => {
        if (prev >= 90) return prev
        // 递减式增长：前期快，后期慢
        const inc = prev < 30 ? 5 : prev < 60 ? 3 : prev < 80 ? 1.5 : 0.5
        return Math.min(prev + inc, 90)
      })
    }, 800)
    return () => clearInterval(timer)
  }, [generating])

  const PRESET_TOPICS = [
    'JavaScript 基础',
    'Python 入门',
    'React 组件与状态',
    'TypeScript 类型系统',
    'CSS 布局与 Flexbox',
    'Node.js 异步编程',
    'SQL 查询基础',
    '数据结构与算法',
  ]

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('请输入考试主题')
      return
    }
    const activeModel = getActiveModel()
    if (!activeModel) {
      setError('请先在设置中配置 AI 模型')
      return
    }
    if (!currentUserId) {
      setError('请先登录')
      return
    }

    setGenerating(true)
    setError(null)
    setStreamingText('')

    // 创建任务队列
    const { createTask, updateTask } = useTaskQueueStore.getState()
    const task = await createTask({
      type: 'lesson',
      title: `生成考卷：${topic}`,
    })

    try {
      const provider = createProvider(activeModel.baseUrl, activeModel.model)
      const prompt = buildExamPrompt({
        topic,
        difficulty,
        count,
        shortAnswerCount,
        codePracticeCount,
      })

      let chunkCount = 0
      const fullContent = await provider.sendMessage(
        [{ role: 'user', content: prompt }],
        { userId: useUserStore.getState().currentUserId!, modelId: activeModel.id },
        (chunk) => {
          setStreamingText((prev) => prev + chunk)
          chunkCount++
          if (task && chunkCount % 10 === 0) {
            updateTask(task.id, { progress: Math.min(chunkCount * 3, 80) })
          }
        },
      )

      const parsed = parseAIResponseRobust<any>(fullContent, null)

      if (parsed && parsed.questions && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        // 强制使用用户选择的 difficulty，不用 AI 返回的值
        const examData = {
          title: parsed.title || topic,
          description: parsed.description || `关于 ${topic} 的${DIFFICULTY_LABELS[difficulty].label}测验`,
          category: parsed.category || topic,
          difficulty,  // 用户选择的值
          questions: parsed.questions,
        }
        const exam = await createExam(currentUserId, examData)

        if (exam) {
          setFakeProgress(100)
          if (task) updateTask(task.id, { status: 'completed', progress: 100 })
          onGenerated(exam)
        } else {
          throw new Error('保存考试失败')
        }
      } else {
        throw new Error('AI 返回的内容无法解析为考试题目')
      }
    } catch (err: any) {
      setError(err?.message || '生成失败，请重试')
      if (task) updateTask(task.id, { status: 'failed', error: err?.message })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-cm-border bg-cm-surface p-6 shadow-xl"
      >
        <h2 className="flex items-center gap-2 text-xl font-bold text-cm-text">
          <Zap className="h-5 w-5 text-cm-accent" />
          AI 生成考卷
        </h2>
        <p className="mt-1 text-sm text-cm-muted">输入主题，AI 自动出题并生成解析</p>

        <div className="mt-5 space-y-4">
          {/* 主题输入 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-cm-text-secondary">
              考试主题
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="如：JavaScript 闭包与作用域"
              className="w-full rounded-xl border border-cm-border bg-cm-card-alt px-4 py-2.5 text-sm text-cm-text outline-none focus:border-cm-accent"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESET_TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTopic(t)}
                  className="rounded-full border border-cm-border bg-cm-card-alt px-3 py-1 text-xs text-cm-muted transition-colors hover:border-cm-accent hover:text-cm-accent"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 难度选择 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-cm-text-secondary">难度</label>
            <div className="flex gap-2">
              {(['easy', 'medium', 'hard'] as const).map((d) => {
                const diff = DIFFICULTY_LABELS[d]
                return (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`flex-1 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                      difficulty === d
                        ? 'border-cm-accent bg-cm-accent-light text-cm-accent'
                        : 'border-cm-border bg-cm-card-alt text-cm-muted'
                    }`}
                  >
                    {diff.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 题目数量 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-cm-text-secondary">
              选择题数量：{count} 题
            </label>
            <input
              type="range"
              min={5}
              max={20}
              step={5}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-cm-accent"
            />
          </div>

          {/* 大题（主观题）：简答题与代码实操题各一个独立滑块，颜色统一主题色 */}
          <div className="rounded-xl border border-cm-border bg-cm-card-alt/50 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-cm-muted">大题不参与自动判分，提交后对照参考答案自评</span>
            </div>

            {/* 简答题数量 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-cm-text-secondary">
                简答题数量：{shortAnswerCount} 题
              </label>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={shortAnswerCount}
                onChange={(e) => setShortAnswerCount(Number(e.target.value))}
                className="w-full accent-cm-accent"
              />
            </div>

            {/* 代码实操题数量 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-cm-text-secondary">
                代码实操题数量：{codePracticeCount} 题
              </label>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={codePracticeCount}
                onChange={(e) => setCodePracticeCount(Number(e.target.value))}
                className="w-full accent-cm-accent"
              />
            </div>
          </div>

          {/* 生成中状态 */}
          {generating && (
            <div className="rounded-xl border border-cm-accent/30 bg-cm-accent-light px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-cm-accent">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 正在出题... {Math.round(fakeProgress)}%
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cm-accent/20">
                <div
                  className="h-full rounded-full bg-cm-accent transition-all duration-700 ease-out"
                  style={{ width: `${fakeProgress}%` }}
                />
              </div>
              {streamingText.length > 0 && (
                <p className="mt-2 text-xs text-cm-muted">
                  已接收 {streamingText.length} 字符
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-cm-red/30 bg-cm-red/10 px-4 py-3 text-sm text-cm-red">
              {error}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-cm-border px-5 py-2.5 text-sm font-medium text-cm-text-secondary hover:bg-cm-card-alt"
          >
            取消
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !topic.trim()}
            className="flex items-center gap-2 rounded-xl bg-cm-accent px-5 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90 disabled:opacity-40"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            生成考卷
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

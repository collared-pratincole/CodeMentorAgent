import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardList,
  Upload,
  FileText,
  X,
  Loader2,
  Sparkles,
  Calendar,
  CheckCircle2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  XCircle,
  Trophy,
  RotateCcw,
} from 'lucide-react'
import GlowCard from '@/components/common/GlowCard'
import { useUserStore } from '@/stores/useUserStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { createProvider } from '@/services/ai'
import { parseAIResponseRobust } from '@/utils/aiParser'
import {
  listMemorizeMaterials,
  getMemorizeMaterial,
  createMemorizeMaterial,
  updateCardStatus,
  deleteMemorizeMaterial,
  resetDayCards,
  type MemorizeMaterialSummary,
  type MemorizeMaterial,
  type FlashCard,
} from '@/services/api'

export default function Memorize() {
  const { currentUserId } = useUserStore()
  const getActiveModel = useSettingsStore((s) => s.getActiveModel)

  const [materials, setMaterials] = useState<MemorizeMaterialSummary[]>([])
  const [selectedMaterial, setSelectedMaterial] = useState<MemorizeMaterial | null>(null)
  const [loadingMaterial, setLoadingMaterial] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadContent, setUploadContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // 当前查看的天数索引
  const [currentDay, setCurrentDay] = useState(0)
  // 当前卡片索引
  const [cardIndex, setCardIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  // 今日全部背完的完成弹窗
  const [showComplete, setShowComplete] = useState(false)

  // 加载资料列表
  const loadMaterials = useCallback(async () => {
    if (!currentUserId) return
    const list = await listMemorizeMaterials(currentUserId)
    setMaterials(list)
  }, [currentUserId])

  useEffect(() => {
    loadMaterials()
  }, [loadMaterials])

  // 选中资料时加载详情
  const handleSelectMaterial = useCallback(async (materialId: string) => {
    if (!currentUserId) return
    setLoadingMaterial(true)
    setSelectedMaterial(null)
    setCurrentDay(0)
    setCardIndex(0)
    setFlipped(false)
    setShowComplete(false)
    const detail = await getMemorizeMaterial(currentUserId, materialId)
    setSelectedMaterial(detail)
    setLoadingMaterial(false)
  }, [currentUserId])

  // 今日卡片 = dayIndex === currentDay 的卡片
  const todayCards = selectedMaterial?.cards.filter(c => c.dayIndex === currentDay) || []
  const currentCard = todayCards[cardIndex]

  // 翻转/导航
  const handleNextCard = () => {
    if (cardIndex < todayCards.length - 1) {
      setCardIndex(cardIndex + 1)
      setFlipped(false)
    }
  }
  const handlePrevCard = () => {
    if (cardIndex > 0) {
      setCardIndex(cardIndex - 1)
      setFlipped(false)
    }
  }

  // 标记卡片状态
  // 背诵机制：「我会了」跳到下一张未掌握卡片；「我不会」保持当前卡片继续背
  const handleMarkCard = async (status: FlashCard['status']) => {
    if (!currentUserId || !selectedMaterial || !currentCard) return
    const updated = await updateCardStatus(currentUserId, selectedMaterial.id, currentCard.id, status)
    if (!updated) return

    // 构造更新后的今日卡片列表（基于更新后的数据）
    const updatedTodayCards = selectedMaterial.cards
      .filter(c => c.dayIndex === currentDay)
      .map(c => c.id === currentCard.id ? { ...c, ...updated } : c)

    // 更新本地状态
    setSelectedMaterial(prev => {
      if (!prev) return prev
      return {
        ...prev,
        cards: prev.cards.map(c => c.id === currentCard.id ? { ...c, ...updated } : c),
      }
    })

    // 重置翻转状态（回到正面）
    setFlipped(false)

    if (status === 'mastered') {
      // 「我会了」：找下一张未掌握的卡片
      // 先从当前位置往后找
      let nextIdx = -1
      for (let i = cardIndex + 1; i < updatedTodayCards.length; i++) {
        if (updatedTodayCards[i].status !== 'mastered') {
          nextIdx = i
          break
        }
      }
      // 往后没找到，从头找
      if (nextIdx === -1) {
        for (let i = 0; i < cardIndex; i++) {
          if (updatedTodayCards[i].status !== 'mastered') {
            nextIdx = i
            break
          }
        }
      }
      if (nextIdx !== -1) {
        setCardIndex(nextIdx)
      } else {
        // 全部 mastered
        setShowComplete(true)
      }
    }
    // 「我不会」：保持当前卡片，等待用户再次「我会了」
  }

  // 再来一轮：重置今日所有卡片
  const handleRetry = async () => {
    if (!currentUserId || !selectedMaterial) return
    const updated = await resetDayCards(currentUserId, selectedMaterial.id, currentDay)
    if (updated) {
      setSelectedMaterial(updated)
      setCardIndex(0)
      setFlipped(false)
      setShowComplete(false)
    }
  }

  // 删除资料
  const handleDeleteMaterial = async (materialId: string) => {
    if (!currentUserId) return
    if (!confirm('确认删除这份资料及其所有卡片？')) return
    const ok = await deleteMemorizeMaterial(currentUserId, materialId)
    if (ok) {
      if (selectedMaterial?.id === materialId) setSelectedMaterial(null)
      loadMaterials()
    }
  }

  // AI 生成卡片
  const handleUpload = async () => {
    if (!uploadTitle.trim() || !uploadContent.trim() || !currentUserId) return
    const activeModel = getActiveModel()
    if (!activeModel) {
      setGenError('请先在设置中配置 AI 模型')
      return
    }

    setGenerating(true)
    setGenError(null)

    try {
      const provider = createProvider(activeModel.baseUrl, activeModel.model)
      const prompt = buildMemorizePrompt(uploadContent)

      const fullContent = await provider.sendMessage(
        [{ role: 'user', content: prompt }],
        { userId: useUserStore.getState().currentUserId!, modelId: activeModel.id },
        () => {}
      )

      const parsed = parseAIResponseRobust<{ cards: { front: string; back: string; tags?: string[] }[] } | null>(fullContent, null)

      if (!parsed || !Array.isArray(parsed.cards) || parsed.cards.length === 0) {
        setGenError('AI 未能生成有效卡片，请检查资料内容或重试')
        return
      }

      const aiSummary = parsed.cards.slice(0, 3).map(c => c.front).join('；')

      const material = await createMemorizeMaterial(currentUserId, {
        title: uploadTitle.trim(),
        rawContent: uploadContent,
        fileType: 'text',
        aiSummary: `共 ${parsed.cards.length} 张卡片：${aiSummary}`,
        cards: parsed.cards,
      })

      if (material) {
        await loadMaterials()
        setSelectedMaterial(material)
        setCurrentDay(0)
        setCardIndex(0)
        setFlipped(false)
        setShowUpload(false)
        setUploadTitle('')
        setUploadContent('')
      } else {
        setGenError('保存资料失败，请重试')
      }
    } catch (err: any) {
      setGenError(`生成失败: ${err?.message || '未知错误'}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      {/* 页头 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-cm-text">
            <ClipboardList className="h-7 w-7 text-cm-accent" />
            考前速记
          </h1>
          <p className="mt-1 text-sm text-cm-muted">
            上传考务资料，AI 自动拆成每日背诵卡片，配合艾宾浩斯复习
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 rounded-xl bg-cm-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cm-accent-dark"
        >
          <Upload size={16} />
          上传资料
        </button>
      </div>

      {/* 提示横幅 */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-cm-amber/30 bg-cm-amberLight/30 px-4 py-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cm-amber" />
        <div className="text-xs text-cm-text-secondary">
          <span className="font-medium">面向考试场景</span>
          （期末考 / 考证 / 竞赛备赛）。对编程能力提升，建议使用
          <span className="mx-1 text-cm-accent">项目实战</span>+<span className="mx-1 text-cm-accent">代码练习</span>。
        </div>
      </div>

      {/* 主体：资料库 + 今日背诵 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 左栏：资料库 */}
        <GlowCard className="lg:col-span-1">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-cm-accent" />
            <h2 className="text-sm font-semibold text-cm-text">资料库</h2>
            <span className="ml-auto text-xs text-cm-muted">{materials.length} 份</span>
          </div>
          <div className="space-y-2">
            {materials.length === 0 ? (
              <div className="rounded-lg border border-dashed border-cm-border py-8 text-center text-xs text-cm-muted">
                暂无资料
                <br />
                点击右上角"上传资料"开始
              </div>
            ) : (
              materials.map((m) => (
                <div
                  key={m.id}
                  className={`group flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors cursor-pointer ${
                    selectedMaterial?.id === m.id
                      ? 'border-cm-accent/40 bg-cm-accent-light/30'
                      : 'border-cm-border-light bg-cm-card-alt hover:border-cm-accent/30'
                  }`}
                  onClick={() => handleSelectMaterial(m.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-cm-text">{m.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-cm-muted">
                      <span>{m.cardCount} 张</span>
                      <span>{new Date(m.createdAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteMaterial(m.id) }}
                    className="rounded p-1 text-cm-muted opacity-0 transition-opacity hover:bg-cm-card hover:text-cm-red group-hover:opacity-100"
                    title="删除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </GlowCard>

        {/* 中右栏：今日背诵 */}
        <GlowCard className="lg:col-span-2 min-h-[400px]">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-cm-accent" />
              <h2 className="text-sm font-semibold text-cm-text">今日背诵</h2>
            </div>
            {selectedMaterial && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setCurrentDay(Math.max(0, currentDay - 1)); setCardIndex(0); setFlipped(false); setShowComplete(false) }}
                  disabled={currentDay === 0}
                  className="rounded p-1 text-cm-muted hover:bg-cm-card-alt disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-cm-muted">第 {currentDay + 1} 天</span>
                <button
                  onClick={() => { setCurrentDay(currentDay + 1); setCardIndex(0); setFlipped(false); setShowComplete(false) }}
                  disabled={!selectedMaterial.cards.some(c => c.dayIndex === currentDay + 1)}
                  className="rounded p-1 text-cm-muted hover:bg-cm-card-alt disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          {loadingMaterial ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-cm-accent" />
            </div>
          ) : !selectedMaterial ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="mb-3 h-10 w-10 text-cm-muted/40" />
              <p className="text-sm text-cm-muted">从左侧选择一份资料开始背诵</p>
            </div>
          ) : todayCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="mb-3 h-10 w-10 text-cm-muted/40" />
              <p className="text-sm text-cm-muted">这一天没有卡片</p>
              <p className="mt-1 text-xs text-cm-muted/70">切换到其他天数查看</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {/* 进度条 - 显示已掌握进度 */}
              <div className="mb-4 flex w-full items-center gap-2">
                <span className="text-xs text-cm-muted">
                  已掌握 {todayCards.filter(c => c.status === 'mastered').length} / {todayCards.length}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cm-card-alt">
                  <motion.div
                    className="h-full bg-cm-accent"
                    animate={{ width: `${(todayCards.filter(c => c.status === 'mastered').length / todayCards.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-cm-muted">
                  第 {cardIndex + 1} 张
                </span>
              </div>

              {/* 卡片 */}
              <div
                className="relative h-64 w-full max-w-md cursor-pointer"
                style={{ perspective: '1000px' }}
                onClick={() => setFlipped(!flipped)}
              >
                <AnimatePresence mode="wait">
                  {!flipped ? (
                    <motion.div
                      key={`front-${currentCard?.id}`}
                      initial={{ rotateY: 180, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      exit={{ rotateY: -180, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-cm-border bg-cm-card p-6 text-center shadow-lg"
                    >
                      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-cm-muted">
                        正面 · 问题
                      </div>
                      <div className="text-lg font-semibold text-cm-text">
                        {currentCard?.front}
                      </div>
                      <div className="mt-4 text-[11px] text-cm-muted">点击翻转查看答案</div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={`back-${currentCard?.id}`}
                      initial={{ rotateY: 180, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      exit={{ rotateY: -180, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-cm-accent/30 bg-cm-accent-light/20 p-6 text-center shadow-lg"
                    >
                      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-cm-accent">
                        反面 · 答案
                      </div>
                      <div className="text-sm text-cm-text whitespace-pre-wrap">
                        {currentCard?.back}
                      </div>
                      {currentCard?.tags && currentCard.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap justify-center gap-1">
                          {currentCard.tags.map((t, i) => (
                            <span key={i} className="rounded-full bg-cm-card-alt px-2 py-0.5 text-[10px] text-cm-muted">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 操作按钮 - 仅在翻转查看答案后显示 */}
              {flipped ? (
                <div className="mt-6 flex items-center gap-2">
                  <button
                    onClick={handlePrevCard}
                    disabled={cardIndex === 0}
                    className="rounded-lg p-2 text-cm-muted hover:bg-cm-card-alt disabled:opacity-30"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => handleMarkCard('learning')}
                    className="flex items-center gap-1 rounded-lg border border-cm-red/40 px-4 py-1.5 text-xs font-medium text-cm-red hover:bg-cm-red/10"
                  >
                    <XCircle size={12} />
                    我不会
                  </button>
                  <button
                    onClick={() => handleMarkCard('mastered')}
                    className="flex items-center gap-1 rounded-lg bg-cm-green/90 px-4 py-1.5 text-xs font-medium text-white hover:bg-cm-green"
                  >
                    <CheckCircle2 size={12} />
                    我会了
                  </button>
                  <button
                    onClick={handleNextCard}
                    disabled={cardIndex === todayCards.length - 1}
                    className="rounded-lg p-2 text-cm-muted hover:bg-cm-card-alt disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="mt-6 text-center text-xs text-cm-muted">
                  点击卡片查看答案后再标记
                </div>
              )}
            </div>
          )}
        </GlowCard>
      </div>

      {/* 上传弹窗 */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !generating && setShowUpload(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl border border-cm-border bg-cm-surface p-6 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-cm-text">上传考务资料</h3>
                <button
                  onClick={() => !generating && setShowUpload(false)}
                  className="rounded-lg p-1 text-cm-muted hover:bg-cm-card-alt hover:text-cm-text"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-cm-muted">资料标题</label>
                  <input
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="例如：数据结构期末复习"
                    className="w-full rounded-lg border border-cm-border bg-cm-card px-3 py-2 text-sm text-cm-text outline-none focus:border-cm-accent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-cm-muted">资料内容（直接粘贴文本）</label>
                  <textarea
                    value={uploadContent}
                    onChange={(e) => setUploadContent(e.target.value)}
                    placeholder="粘贴考务资料的全文内容..."
                    rows={8}
                    className="w-full resize-none rounded-lg border border-cm-border bg-cm-card px-3 py-2 text-sm text-cm-text outline-none focus:border-cm-accent"
                  />
                  <div className="mt-1 text-[11px] text-cm-muted">
                    AI 将自动提取知识点并拆成每日背诵卡片（每天 8 张，共 7 天）
                  </div>
                </div>
                {genError && (
                  <div className="rounded-lg border border-cm-red/30 bg-cm-red/10 px-3 py-2 text-xs text-cm-red">
                    {genError}
                  </div>
                )}
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setShowUpload(false)}
                  disabled={generating}
                  className="rounded-lg px-4 py-2 text-sm text-cm-muted hover:bg-cm-card-alt disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleUpload}
                  disabled={generating || !uploadTitle.trim() || !uploadContent.trim()}
                  className="flex items-center gap-2 rounded-lg bg-cm-accent px-4 py-2 text-sm font-medium text-white hover:bg-cm-accent-dark disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      AI 生成卡片中...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      AI 生成卡片
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 今日全背完弹窗 */}
      <AnimatePresence>
        {showComplete && selectedMaterial && (() => {
          const wrongCards = todayCards
            .map(c => ({ front: c.front, wrongCount: c.wrongCount || 0 }))
            .filter(c => c.wrongCount > 0)
            .sort((a, b) => b.wrongCount - a.wrongCount)
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 10 }}
                className="w-full max-w-md rounded-2xl border border-cm-border bg-cm-surface p-6 text-center shadow-2xl"
              >
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cm-green/15">
                  <Trophy className="h-7 w-7 text-cm-amber" />
                </div>
                <h3 className="text-lg font-bold text-cm-text">恭喜你全背完了！</h3>
                <p className="mt-1 text-sm text-cm-muted">
                  今日 {todayCards.length} 张卡片已全部掌握
                </p>

                {wrongCards.length > 0 ? (
                  <div className="mt-4 rounded-xl border border-cm-border bg-cm-card-alt p-3 text-left">
                    <div className="mb-2 text-xs font-medium text-cm-text-secondary">
                      本次易错知识点（共 {wrongCards.length} 个）：
                    </div>
                    <ol className="space-y-1.5 text-xs text-cm-text">
                      {wrongCards.map((c, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 text-cm-muted">{i + 1}.</span>
                          <span className="flex-1 truncate">{c.front}</span>
                          <span className="shrink-0 rounded-full bg-cm-red/10 px-2 py-0.5 text-[11px] font-medium text-cm-red">
                            错 {c.wrongCount} 次
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-cm-green/30 bg-cm-green-light/40 p-3 text-xs text-cm-green">
                    一次全对，太棒了！
                  </div>
                )}

                <div className="mt-5 flex justify-center gap-2">
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-1.5 rounded-lg border border-cm-border px-4 py-2 text-sm font-medium text-cm-text-secondary hover:bg-cm-card-alt"
                  >
                    <RotateCcw size={14} />
                    再来一轮
                  </button>
                  <button
                    onClick={() => setShowComplete(false)}
                    className="rounded-lg bg-cm-accent px-4 py-2 text-sm font-medium text-white hover:bg-cm-accent-dark"
                  >
                    完成
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}

/**
 * 构建考前速记 AI prompt
 * 要求 AI 输出结构化 JSON：{ cards: [{ front, back, tags }] }
 */
function buildMemorizePrompt(rawContent: string): string {
  return `你是一位考务复习助手。请基于以下考务资料，提取关键知识点，生成背诵卡片。

要求：
1. 每个卡片只聚焦一个知识点
2. 正面是问题/关键词，背面是精简答案（不超过 3 行）
3. 总共生成 30-56 张卡片（约 7 天量，每天 8 张）
4. 按知识点难度从易到难排列
5. 输出必须是合法 JSON，格式为：{ "cards": [{ "front": "问题", "back": "答案", "tags": ["关键词"] }] }

考务资料内容：
${rawContent}

请直接输出 JSON，不要加 markdown 代码块标记、不要加任何解释。`
}

import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderOpen,
  Folder,
  FileText,
  FileCode2,
  FileJson,
  FileType,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  FolderSearch,
  CheckCircle2,
  Circle,
  Lightbulb,
  Eye,
  Layers,
  Code2,
  Loader2,
  AlertTriangle,
  Send,
} from 'lucide-react'
import { useProjectStore, type BuildStep, type CurrentProject } from '@/stores/useProjectStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { createProvider } from '@/services/ai'
import { buildProjectAnalysisPrompt, buildBuildStepPrompt } from '@/utils/promptBuilder'
import { parseAIResponseRobust } from '@/utils/aiParser'
import { isProjectAnalysis, isBuildStep, type ProjectAnalysisOutput, type BuildStepOutput } from '@/types/ai-output'
import GlowCard from '@/components/common/GlowCard'
import CodeBlock from '@/components/common/CodeBlock'

// --- Helper components ---

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'tsx':
    case 'ts':
      return <FileCode2 size={16} className="text-cm-green" />
    case 'jsx':
    case 'js':
      return <FileCode2 size={16} className="text-cm-amber" />
    case 'json':
      return <FileJson size={16} className="text-cm-amber" />
    case 'css':
    case 'scss':
      return <FileType size={16} className="text-cm-purple" />
    case 'svg':
      return <FileText size={16} className="text-cm-green" />
    default:
      return <FileText size={16} className="text-cm-muted" />
  }
}

interface FileTreeNode {
  name: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  language?: string
}

function FileTreeItem({
  node,
  depth = 0,
  selectedFile,
  onSelect,
}: {
  node: FileTreeNode
  depth?: number
  selectedFile: string | null
  onSelect: (name: string) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm text-cm-text-secondary transition-colors hover:bg-cm-card-alt hover:text-cm-text"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <ChevronRight
            size={14}
            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          <Folder size={16} className="text-cm-amber" />
          <span>{node.name}</span>
        </button>
        <AnimatePresence>
          {expanded && node.children && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {node.children.map((child) => (
                <FileTreeItem
                  key={child.name}
                  node={child}
                  depth={depth + 1}
                  selectedFile={selectedFile}
                  onSelect={onSelect}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelect(node.name)}
      className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
        selectedFile === node.name
          ? 'bg-cm-accent-light text-cm-accent'
          : 'text-cm-text-secondary hover:bg-cm-card-alt hover:text-cm-text'
      }`}
      style={{ paddingLeft: `${depth * 16 + 24}px` }}
    >
      {getFileIcon(node.name)}
      <span>{node.name}</span>
    </button>
  )
}

type TabKey = 'overview' | 'build' | 'code'

const tabs: { key: TabKey; label: string; icon: typeof Eye }[] = [
  { key: 'overview', label: '全景分析', icon: Eye },
  { key: 'build', label: '逐步构建', icon: Layers },
  { key: 'code', label: '代码浏览', icon: Code2 },
]

// --- Main component ---

export default function ProjectAnalysis() {
  const {
    currentProject,
    analysis,
    buildSteps,
    currentStep,
    isAnalyzing,
    setProject,
    setAnalysis,
    setBuildSteps,
    setAnalyzing,
    nextStep,
    prevStep,
  } = useProjectStore()

  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<{ path: string; content: string; size: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [buildStepLoading, setBuildStepLoading] = useState(false)
  const [buildStepError, setBuildStepError] = useState<string | null>(null)

  const getActiveModel = useSettingsStore((s) => s.getActiveModel)

  const handleFolderUpload = async (files: FileList) => {
    const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage', '__pycache__', '.venv', 'venv', 'target', 'bin', 'obj'])
    const MAX_FILE_SIZE = 50 * 1024  // 50KB per file
    const MAX_TOTAL_SIZE = 5 * 1024 * 1024  // 5MB total

    const fileEntries: { path: string; content: string; size: number }[] = []
    let totalSize = 0

    for (const file of Array.from(files)) {
      const path = file.webkitRelativePath || file.name
      const parts = path.split('/')
      // 跳过指定目录
      if (parts.some(p => SKIP_DIRS.has(p))) continue
      // 跳过二进制文件
      if (/\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|mp3|mp4|zip|tar|gz|exe|dll|so|dylib|wasm|map|lock)$/i.test(path)) continue
      // 跳过大文件
      if (file.size > MAX_FILE_SIZE) continue
      if (totalSize + file.size > MAX_TOTAL_SIZE) continue

      try {
        const content = await file.text()
        fileEntries.push({ path, content, size: file.size })
        totalSize += file.size
      } catch { /* skip unreadable files */ }
    }

    return fileEntries
  }

  const analyzeProject = useCallback(async () => {
    if (uploadedFiles.length === 0) return

    const activeModel = getActiveModel()
    if (!activeModel) {
      setError('请先在设置中配置 AI 模型')
      return
    }

    setError(null)
    setAnalyzing(true)
    setStreamingText('')

    // Build structured text from uploaded files
    const fileList = uploadedFiles.map(f => f.path).join('\n')
    const fileContents = uploadedFiles.map(f => `=== ${f.path} ===\n${f.content}`).join('\n\n')
    const structure = `项目文件列表：\n${fileList}\n\n文件内容：\n${fileContents}`

    try {
      const provider = createProvider(activeModel.baseUrl, activeModel.model)
      const prompt = buildProjectAnalysisPrompt(uploadedFiles.map(f => f.path), structure)

      const fullContent = await provider.sendMessage(
        [{ role: 'user', content: prompt }],
        activeModel.apiKey,
        (chunk) => {
          setStreamingText((prev) => prev + chunk)
        }
      )

      const parsed = parseAIResponseRobust<ProjectAnalysisOutput | null>(fullContent, null)

      if (parsed && isProjectAnalysis(parsed)) {
        // Build project object
        const allTech = [
          ...parsed.techStack.language,
          ...parsed.techStack.framework,
          ...parsed.techStack.libraries,
          ...parsed.techStack.tools,
        ]
        const projectName = parsed.projectName || '未命名项目'

        const project: CurrentProject = {
          name: projectName,
          path: `/projects/${projectName}`,
          techStack: allTech,
          structure,
        }
        setProject(project)

        // Build initial build steps from the analysis
        // We'll create placeholder steps; actual content will be generated on demand
        const stepCount = Math.max(3, Math.min(8, parsed.suggestions.length + parsed.techStack.framework.length + 1))
        const initialSteps: BuildStep[] = Array.from({ length: stepCount }, (_, i) => ({
          step: i + 1,
          title: `步骤 ${i + 1}`,
          description: '正在生成...',
          commands: [],
          status: 'pending' as const,
        }))
        setBuildSteps(initialSteps)

        // Save analysis
        setAnalysis({
          projectName,
          techStack: JSON.stringify(allTech),
          directoryStructure: structure,
          analysisReport: JSON.stringify(parsed),
          buildSteps: JSON.stringify(initialSteps),
          createdAt: new Date().toISOString(),
        })

        // Auto-generate the first build step
        generateBuildStep(0, stepCount, parsed, activeModel)
      } else {
        setError('AI 返回的分析结果格式不正确，请重试')
      }
    } catch (err: any) {
      setError(err?.message || 'AI 分析请求失败，请检查网络和 API 配置')
    } finally {
      setAnalyzing(false)
      setStreamingText('')
    }
  }, [uploadedFiles, getActiveModel, setProject, setAnalysis, setBuildSteps, setAnalyzing])

  const generateBuildStep = useCallback(async (
    stepIndex: number,
    totalSteps: number,
    context: ProjectAnalysisOutput | string,
    activeModel: NonNullable<ReturnType<typeof getActiveModel>>
  ) => {
    setBuildStepLoading(true)
    setBuildStepError(null)

    const projectContext = typeof context === 'string' ? context : JSON.stringify(context)

    try {
      const provider = createProvider(activeModel.baseUrl, activeModel.model)
      const prompt = buildBuildStepPrompt(stepIndex + 1, totalSteps, projectContext)

      const fullContent = await provider.sendMessage(
        [{ role: 'user', content: prompt }],
        activeModel.apiKey,
        () => {}
      )

      const parsed = parseAIResponseRobust<BuildStepOutput | null>(fullContent, null)

      if (parsed && isBuildStep(parsed)) {
        const currentSteps = useProjectStore.getState().buildSteps
        const updatedSteps = [...currentSteps]
        updatedSteps[stepIndex] = {
          step: parsed.step,
          title: parsed.title,
          description: parsed.description,
          commands: parsed.commands,
          status: stepIndex === 0 ? 'completed' : 'pending',
          code: parsed.code,
          expectedResult: parsed.expectedResult,
          troubleshooting: parsed.troubleshooting,
        }
        setBuildSteps(updatedSteps)
      } else {
        setBuildStepError('AI 返回的构建步骤格式不正确')
      }
    } catch (err: any) {
      setBuildStepError(err?.message || '生成构建步骤失败')
    } finally {
      setBuildStepLoading(false)
    }
  }, [setBuildSteps])

  const handleStepNavigate = useCallback(async (stepIndex: number) => {
    useProjectStore.setState({ currentStep: stepIndex })

    const { buildSteps, analysis } = useProjectStore.getState()
    const step = buildSteps[stepIndex]
    const activeModel = getActiveModel()

    // If this step hasn't been generated yet (placeholder), generate it
    if (step && step.description === '正在生成...' && activeModel && analysis) {
      let parsed: ProjectAnalysisOutput | null = null
      try {
        parsed = parseAIResponseRobust<ProjectAnalysisOutput | null>(analysis.analysisReport, null)
      } catch { parsed = null }
      const context = parsed && isProjectAnalysis(parsed) ? parsed : analysis.directoryStructure
      generateBuildStep(stepIndex, buildSteps.length, context, activeModel)
    }
  }, [getActiveModel, generateBuildStep])

  const handleReanalyze = useCallback(() => {
    if (uploadedFiles.length === 0) return
    analyzeProject()
  }, [analyzeProject, uploadedFiles])

  const step = buildSteps[currentStep]
  const techStack = currentProject?.techStack ?? []

  // Parse analysis report for overview tab
  let parsedAnalysis: ProjectAnalysisOutput | null = null
  try {
    parsedAnalysis = analysis?.analysisReport
      ? parseAIResponseRobust<ProjectAnalysisOutput | null>(analysis.analysisReport, null)
      : null
  } catch { parsedAnalysis = null }
  const analysisData = parsedAnalysis && isProjectAnalysis(parsedAnalysis) ? parsedAnalysis : null

  // Build a simple file tree from the project structure text
  const fileTree: FileTreeNode[] = currentProject?.structure
    ? currentProject.structure
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split('/').filter(Boolean)
          const name = parts[parts.length - 1] || line
          const isDir = !name.includes('.') && !line.includes('.')
          return {
            name,
            type: (isDir ? 'directory' : 'file') as 'directory' | 'file',
            language: name.split('.').pop()?.toLowerCase(),
          }
        })
    : []

  return (
    <div className="min-h-screen bg-cm-bg">
      {!currentProject ? (
        /* ===== No Project State ===== */
        <div className="flex min-h-screen items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-lg"
          >
            <div className="flex flex-col items-center gap-5 rounded-2xl border-2 border-dashed border-cm-border bg-cm-card-alt p-10 transition-all duration-300">
              <motion.div
                animate={isAnalyzing ? { rotate: 360 } : { scale: [1, 1.1, 1] }}
                transition={isAnalyzing ? { repeat: Infinity, duration: 2, ease: 'linear' } : { repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              >
                {isAnalyzing ? (
                  <Loader2 size={56} className="text-cm-accent" />
                ) : (
                  <FolderOpen size={56} className="text-cm-accent" />
                )}
              </motion.div>

              <div className="text-center">
                <p className="text-lg font-medium text-cm-text">
                  {isAnalyzing ? 'AI 正在分析项目...' : '上传项目文件，AI 帮你分析'}
                </p>
                <p className="mt-2 text-sm text-cm-muted">
                  {isAnalyzing ? '请稍候，正在生成分析报告' : '选择项目文件夹，AI 将自动分析项目结构和技术栈'}
                </p>
              </div>

              {!isAnalyzing && (
                <>
                  {uploadedFiles.length === 0 ? (
                    <label className="group flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-cm-border bg-cm-card/50 p-8 transition-all hover:border-cm-accent/50 hover:bg-cm-accent/5">
                      <FolderOpen size={40} className="text-cm-muted transition-colors group-hover:text-cm-accent" />
                      <div className="text-center">
                        <p className="text-sm font-medium text-cm-text">点击选择项目文件夹</p>
                        <p className="mt-1 text-xs text-cm-muted">支持上传整个项目目录，自动跳过 node_modules、.git 等</p>
                      </div>
                      <input
                        ref={(el) => { if (el) { el.setAttribute('webkitdirectory', ''); el.setAttribute('directory', '') } }}
                        type="file"
                        className="hidden"
                        onChange={async (e) => {
                          const files = e.target.files
                          if (files && files.length > 0) {
                            const entries = await handleFolderUpload(files)
                            if (entries.length === 0) {
                              setError('未找到可分析的文件，请检查文件夹内容')
                            } else {
                              setUploadedFiles(entries)
                              setError(null)
                            }
                          }
                        }}
                      />
                    </label>
                  ) : (
                    <div className="w-full space-y-3">
                      <div className="flex items-center justify-between rounded-xl border border-cm-border bg-cm-card p-4">
                        <div className="flex items-center gap-3">
                          <FolderOpen size={20} className="text-cm-accent" />
                          <div>
                            <p className="text-sm font-medium text-cm-text">
                              已上传 {uploadedFiles.length} 个文件
                            </p>
                            <p className="text-xs text-cm-muted">
                              共 {(uploadedFiles.reduce((sum, f) => sum + f.size, 0) / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <label className="cursor-pointer rounded-lg border border-cm-border px-3 py-1.5 text-xs text-cm-muted transition-colors hover:border-cm-accent/50 hover:text-cm-accent">
                          重新选择
                          <input
                            ref={(el) => { if (el) { el.setAttribute('webkitdirectory', ''); el.setAttribute('directory', '') } }}
                            type="file"
                            className="hidden"
                            onChange={async (e) => {
                              const files = e.target.files
                              if (files && files.length > 0) {
                                const entries = await handleFolderUpload(files)
                                if (entries.length === 0) {
                                  setError('未找到可分析的文件，请检查文件夹内容')
                                  setUploadedFiles([])
                                } else {
                                  setUploadedFiles(entries)
                                  setError(null)
                                }
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="flex w-full items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                      <AlertTriangle size={16} className="shrink-0" />
                      {error}
                    </div>
                  )}

                  {!getActiveModel() && (
                    <div className="flex w-full items-center gap-2 rounded-xl border border-cm-amber/30 bg-cm-amber/10 px-4 py-3 text-sm text-cm-amber">
                      <AlertTriangle size={16} className="shrink-0" />
                      请先前往设置页面配置 AI 模型和 API Key
                    </div>
                  )}

                  <button
                    onClick={analyzeProject}
                    disabled={uploadedFiles.length === 0 || !getActiveModel()}
                    className="flex items-center gap-2 rounded-xl bg-cm-accent px-6 py-2.5 text-sm font-semibold text-white shadow-accent transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send size={16} />
                    分析项目
                  </button>
                </>
              )}

              {isAnalyzing && streamingText && (
                <div className="w-full rounded-xl border border-cm-border bg-cm-card p-4">
                  <div className="mb-2 text-xs font-medium text-cm-muted">AI 输出预览</div>
                  <pre className="max-h-40 overflow-y-auto text-xs text-cm-text-secondary whitespace-pre-wrap break-all scrollbar-thin">
                    {streamingText}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      ) : (
        /* ===== Project Loaded State ===== */
        <div className="flex h-screen flex-col">
          {/* Project Header */}
          <div className="flex flex-col gap-3 border-b border-cm-border bg-cm-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3">
              <FolderSearch size={20} className="text-cm-accent" />
              <h1 className="text-lg font-bold text-cm-text">{currentProject.name}</h1>
              <div className="flex flex-wrap gap-2">
                {techStack.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-full bg-cm-accent-light px-3 py-0.5 text-xs font-medium text-cm-accent"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={handleReanalyze}
              disabled={isAnalyzing}
              className="flex items-center gap-2 rounded-xl border border-cm-border bg-cm-card px-4 py-2 text-sm text-cm-muted transition-colors hover:border-cm-accent/50 hover:text-cm-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={14} className={isAnalyzing ? 'animate-spin' : ''} />
              重新分析
            </button>
          </div>

          {/* Mobile: tabs as horizontal scroll; Desktop: file tree + content */}
          <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
            {/* Desktop: Left Panel - File Tree (hidden on mobile) */}
            <div className="hidden lg:block w-60 shrink-0 border-r border-cm-border bg-cm-card overflow-y-auto">
              <div className="p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-cm-muted">
                  项目结构
                </div>
                {fileTree.length > 0 ? (
                  fileTree.map((file) => (
                    <FileTreeItem
                      key={file.name}
                      node={file}
                      selectedFile={selectedFile}
                      onSelect={setSelectedFile}
                    />
                  ))
                ) : (
                  <p className="text-xs text-cm-muted">暂无文件结构信息</p>
                )}
              </div>
            </div>

            {/* Right Panel - Analysis Content */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Tabs - horizontal scroll on mobile */}
              <div className="flex overflow-x-auto border-b border-cm-border bg-cm-card scrollbar-thin">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
                      activeTab === tab.key
                        ? 'border-cm-accent text-cm-accent'
                        : 'border-transparent text-cm-muted hover:text-cm-text'
                    }`}
                  >
                    <tab.icon size={16} />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <AnimatePresence mode="wait">
                  {/* Tab 1: Overview */}
                  {activeTab === 'overview' && (
                    <motion.div
                      key="overview"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-6"
                    >
                      <GlowCard title="项目概览" accent="amber">
                        <p className="text-sm leading-relaxed text-cm-text-secondary">
                          {analysisData?.architecture?.description || '暂无分析报告，请等待 AI 分析完成。'}
                        </p>
                      </GlowCard>

                      <GlowCard title="技术栈分析" accent="green">
                        {analysisData ? (
                          <div className="space-y-3">
                            {(['language', 'framework', 'libraries', 'tools'] as const).map((category) => {
                              const items = analysisData.techStack[category]
                              if (!items || items.length === 0) return null
                              const labels: Record<string, string> = {
                                language: '语言',
                                framework: '框架',
                                libraries: '库',
                                tools: '工具',
                              }
                              return (
                                <div key={category}>
                                  <div className="mb-1.5 text-xs font-medium text-cm-muted">{labels[category]}</div>
                                  <div className="flex flex-wrap gap-2">
                                    {items.map((item) => (
                                      <div
                                        key={item}
                                        className="flex items-center gap-2 rounded-xl bg-cm-card-alt px-3 py-1.5"
                                      >
                                        <div className="h-2 w-2 rounded-full bg-cm-green" />
                                        <span className="text-sm font-medium text-cm-text">{item}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {techStack.map((tech) => (
                              <div
                                key={tech}
                                className="flex items-center gap-2 rounded-xl bg-cm-card-alt p-3"
                              >
                                <div className="h-2 w-2 rounded-full bg-cm-green" />
                                <span className="text-sm font-medium text-cm-text">{tech}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </GlowCard>

                      <GlowCard title="架构说明" accent="purple">
                        {analysisData ? (
                          <>
                            <p className="text-sm leading-relaxed text-cm-text-secondary">
                              {analysisData.architecture.description}
                            </p>
                            <div className="mt-3 rounded-xl border border-cm-border bg-cm-card-alt p-3">
                              <div className="text-xs font-medium text-cm-muted">架构模式</div>
                              <div className="mt-1 text-sm font-semibold text-cm-accent">
                                {analysisData.architecture.pattern}
                              </div>
                            </div>
                            {analysisData.directoryAnalysis.length > 0 && (
                              <div className="mt-4 space-y-2">
                                <div className="text-xs font-medium text-cm-muted">目录分析</div>
                                {analysisData.directoryAnalysis.map((dir, i) => (
                                  <div key={i} className="rounded-xl border border-cm-border bg-cm-card-alt p-3">
                                    <p className="text-sm text-cm-text-secondary">{dir.description}</p>
                                    {dir.suggestions.length > 0 && (
                                      <ul className="mt-2 space-y-1">
                                        {dir.suggestions.map((s, j) => (
                                          <li key={j} className="flex items-start gap-2 text-xs text-cm-muted">
                                            <Lightbulb size={12} className="mt-0.5 shrink-0 text-cm-amber" />
                                            {s}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-sm leading-relaxed text-cm-text-secondary">
                            暂无架构分析数据
                          </p>
                        )}
                      </GlowCard>

                      <GlowCard title="改进建议" accent="amber">
                        {analysisData?.suggestions && analysisData.suggestions.length > 0 ? (
                          <ul className="space-y-2">
                            {analysisData.suggestions.map((s, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-cm-text-secondary">
                                <Lightbulb size={16} className="mt-0.5 shrink-0 text-cm-amber" />
                                <div>
                                  <span className="font-medium text-cm-text">{s.category}</span>
                                  {' - '}
                                  {s.description}
                                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                                    s.priority === 'high'
                                      ? 'bg-red-500/10 text-red-400'
                                      : s.priority === 'medium'
                                        ? 'bg-cm-amber/10 text-cm-amber'
                                        : 'bg-cm-green/10 text-cm-green'
                                  }`}>
                                    {s.priority === 'high' ? '高' : s.priority === 'medium' ? '中' : '低'}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-cm-muted">暂无改进建议</p>
                        )}
                      </GlowCard>

                      {analysisData && (
                        <GlowCard title="质量评分" accent="green">
                          <div className="flex items-center gap-4">
                            <div className="text-4xl font-bold text-cm-accent">
                              {analysisData.qualityScore}
                            </div>
                            <div className="flex-1">
                              <div className="h-3 rounded-full bg-cm-card-alt overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-cm-accent transition-all"
                                  style={{ width: `${analysisData.qualityScore}%` }}
                                />
                              </div>
                              <p className="mt-1 text-xs text-cm-muted">满分 100</p>
                            </div>
                          </div>
                        </GlowCard>
                      )}
                    </motion.div>
                  )}

                  {/* Tab 2: Build Steps */}
                  {activeTab === 'build' && (
                    <motion.div
                      key="build"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="flex flex-col gap-6 lg:flex-row">
                        {/* Timeline - horizontal on mobile, vertical sidebar on desktop */}
                        <div className="lg:w-48 shrink-0">
                          <div className="text-xs font-medium uppercase tracking-wider text-cm-muted mb-3">
                            构建步骤
                          </div>
                          {/* Horizontal scroll on mobile, vertical on desktop */}
                          <div className="flex gap-1 overflow-x-auto lg:flex-col scrollbar-thin pb-2 lg:pb-0">
                            {buildSteps.map((s, i) => (
                              <button
                                key={s.step}
                                onClick={() => handleStepNavigate(i)}
                                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                                  i === currentStep
                                    ? 'bg-cm-accent-light text-cm-accent'
                                    : 'text-cm-muted hover:bg-cm-card-alt hover:text-cm-text'
                                }`}
                              >
                                {s.status === 'completed' ? (
                                  <CheckCircle2 size={16} className="shrink-0 text-cm-green" />
                                ) : s.status === 'in_progress' ? (
                                  <Loader2 size={16} className="shrink-0 animate-spin text-cm-accent" />
                                ) : (
                                  <Circle size={16} className="shrink-0" />
                                )}
                                <span className="truncate">{s.title}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Current step content */}
                        <div className="flex-1 min-w-0">
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={currentStep}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              transition={{ duration: 0.3 }}
                              className="space-y-4"
                            >
                              {buildStepLoading && (
                                <div className="flex items-center gap-2 rounded-xl border border-cm-accent/30 bg-cm-accent-light px-4 py-3 text-sm text-cm-accent">
                                  <Loader2 size={16} className="animate-spin" />
                                  AI 正在生成此步骤内容...
                                </div>
                              )}

                              {buildStepError && (
                                <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                                  <AlertTriangle size={16} className="shrink-0" />
                                  {buildStepError}
                                </div>
                              )}

                              <div>
                                <div className="text-xs font-medium text-cm-accent">
                                  步骤 {step?.step} / {buildSteps.length}
                                </div>
                                <h3 className="mt-1 text-xl font-bold text-cm-text">
                                  {step?.title}
                                </h3>
                                <p className="mt-2 text-sm leading-relaxed text-cm-text-secondary">
                                  {step?.description}
                                </p>
                              </div>

                              {step?.commands && step.commands.length > 0 && (
                                <CodeBlock
                                  code={step.commands.join('\n')}
                                  language="bash"
                                  title={step.title}
                                />
                              )}

                              {step?.code && (
                                <CodeBlock
                                  code={step.code.content}
                                  language={step.code.language || 'typescript'}
                                  title={step.code.caption || step.title}
                                />
                              )}

                              {step?.expectedResult && (
                                <div className="rounded-xl border border-cm-green/30 bg-cm-green-light p-4">
                                  <div className="mb-1 text-xs font-medium text-cm-green">预期结果</div>
                                  <p className="text-sm text-cm-text-secondary">{step.expectedResult}</p>
                                </div>
                              )}

                              {step?.troubleshooting && step.troubleshooting.length > 0 && (
                                <div className="rounded-xl border border-cm-amber/30 bg-cm-amber-light p-4">
                                  <div className="mb-2 text-xs font-medium text-cm-amber">常见问题</div>
                                  <ul className="space-y-2">
                                    {step.troubleshooting.map((t, i) => (
                                      <li key={i} className="text-sm">
                                        <span className="font-medium text-cm-text">Q: {t.problem}</span>
                                        <p className="mt-0.5 text-cm-text-secondary">A: {t.solution}</p>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Navigation */}
                              <div className="flex items-center justify-between border-t border-cm-border pt-4">
                                <button
                                  onClick={() => handleStepNavigate(currentStep - 1)}
                                  disabled={currentStep === 0}
                                  className="flex items-center gap-2 rounded-xl border border-cm-border px-4 py-2 text-sm text-cm-muted transition-colors hover:border-cm-accent/50 hover:text-cm-accent disabled:cursor-not-allowed disabled:opacity-30"
                                >
                                  <ChevronLeft size={16} />
                                  上一步
                                </button>
                                <span className="text-sm text-cm-muted">
                                  {currentStep + 1} / {buildSteps.length}
                                </span>
                                <button
                                  onClick={() => handleStepNavigate(currentStep + 1)}
                                  disabled={currentStep === buildSteps.length - 1}
                                  className="flex items-center gap-2 rounded-xl border border-cm-border px-4 py-2 text-sm text-cm-muted transition-colors hover:border-cm-accent/50 hover:text-cm-accent disabled:cursor-not-allowed disabled:opacity-30"
                                >
                                  下一步
                                  <ChevronRight size={16} />
                                </button>
                              </div>
                            </motion.div>
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Tab 3: Code Browser */}
                  {activeTab === 'code' && (
                    <motion.div
                      key="code"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="h-full"
                    >
                      {/* Show AI-generated code snippets from build steps */}
                      {buildSteps.some((s) => s.code) ? (
                        <div className="space-y-4">
                          <div className="text-xs font-medium uppercase tracking-wider text-cm-muted">
                            AI 生成的代码片段
                          </div>
                          {buildSteps
                            .filter((s) => s.code)
                            .map((s) => (
                              <CodeBlock
                                key={s.step}
                                code={s.code!.content}
                                language={s.code!.language || 'typescript'}
                                title={`${s.title} - ${s.code!.caption || ''}`}
                                editable
                              />
                            ))}
                        </div>
                      ) : (
                        <div className="flex h-64 items-center justify-center text-cm-muted">
                          <div className="text-center">
                            <Code2 size={48} className="mx-auto mb-3 opacity-30" />
                            <p className="text-sm">文件浏览功能需要桌面端应用支持</p>
                            <p className="mt-1 text-xs text-cm-muted">
                              请在「逐步构建」标签页查看 AI 生成的代码片段
                            </p>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

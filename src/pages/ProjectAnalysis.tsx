import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
  Pencil,
  Trash2,
  Target,
  Clock,
  AlertCircle,
  Link2,
  Play,
} from 'lucide-react'
import { useProjectStore, type BuildStep, type CurrentProject } from '@/stores/useProjectStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUserStore } from '@/stores/useUserStore'
import { useTaskQueueStore } from '@/stores/useTaskQueueStore'
import { createProvider } from '@/services/ai'
import { getProjectFiles, getProjectFileContent, updateProject, deleteProject } from '@/services/api'
import { buildProjectAnalysisPrompt, buildBuildStepPrompt, buildBuildPlanPrompt } from '@/utils/promptBuilder'
import { parseAIResponseRobust } from '@/utils/aiParser'
import { isProjectAnalysis, isBuildStep, isBuildPlan, type ProjectAnalysisOutput, type BuildStepOutput, type BuildPlanOutput } from '@/types/ai-output'
import GlowCard from '@/components/common/GlowCard'
import CodeBlock from '@/components/common/CodeBlock'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
  { key: 'build', label: '从零构建', icon: Layers },
  { key: 'code', label: '代码浏览', icon: Code2 },
]

// --- Main component ---

export default function ProjectAnalysis() {
  const { projectId } = useParams<{ projectId?: string }>()
  const navigate = useNavigate()
  const { currentUserId } = useUserStore()

  const {
    currentProject,
    currentProjectId,
    projects,
    analysis,
    buildSteps,
    currentStep,
    isAnalyzing,
    isLoading,
    setProject,
    updateCurrentProjectMeta,
    setAnalysis,
    setAnalyzing,
    loadProject,
    createProject,
    saveAnalysis,
    saveBuildStepsForProject,
    setBuildStepsIfCurrent,
  } = useProjectStore()

  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<{ path: string; content: string; size: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [buildStepLoading, setBuildStepLoading] = useState(false)
  const [buildStepError, setBuildStepError] = useState<string | null>(null)
  // 构建大纲生成中锁：防止用户多次点击"重新生成"导致并发调用
  const [buildPlanGenerating, setBuildPlanGenerating] = useState(false)
  const [projectFileTree, setProjectFileTree] = useState<FileTreeNode[]>([])
  const [isRenaming, setIsRenaming] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // 根据 URL projectId 加载项目
  useEffect(() => {
    if (projectId && projectId !== currentProjectId) {
      loadProject(projectId)
    }
  }, [projectId, currentProjectId, loadProject])

  // 离开具体项目页面（回到 /project）时清空当前项目状态
  useEffect(() => {
    if (!projectId && (currentProjectId || currentProject)) {
      setProject(null)
      setAnalysis(null)
      setUploadedFiles([])
    }
  }, [projectId, currentProjectId, currentProject, setProject, setAnalysis])

  // 加载项目文件树及内容
  useEffect(() => {
    if (!currentUserId || !currentProjectId) return
    // 竞态保护：项目快速切换时，旧请求完成不覆盖新请求结果
    let cancelled = false
    const targetUserId = currentUserId
    const targetProjectId = currentProjectId

    const loadFiles = async () => {
      const tree = await getProjectFiles(targetUserId, targetProjectId)
      if (cancelled) return

      const convertTreeNode = (node: any): FileTreeNode => {
        const name = node.path.split('/').pop() || node.path
        return {
          name,
          type: node.type,
          language: node.type === 'file' ? name.split('.').pop()?.toLowerCase() : undefined,
          children: node.children ? node.children.map(convertTreeNode) : undefined,
        }
      }
      setProjectFileTree(tree.map(convertTreeNode))

      // 同时把所有文件内容加载到 uploadedFiles，以便重新分析
      const collectPaths = (nodes: any[]): string[] => {
        const paths: string[] = []
        for (const node of nodes) {
          if (node.type === 'file') {
            paths.push(node.path)
          } else if (node.children) {
            paths.push(...collectPaths(node.children))
          }
        }
        return paths
      }

      const paths = collectPaths(tree)
      // 限制并发为 6，避免大项目同时发 100+ 请求撞浏览器连接上限
      const CONCURRENCY = 6
      const results: { path: string; content: string; size: number }[] = []
      for (let i = 0; i < paths.length; i += CONCURRENCY) {
        if (cancelled) return
        const batch = paths.slice(i, i + CONCURRENCY)
        const batchResults = await Promise.all(
          batch.map(async (path) => {
            const res = await getProjectFileContent(targetUserId, targetProjectId, path)
            return { path, content: res?.content || '', size: res?.content?.length || 0 }
          })
        )
        results.push(...batchResults)
      }
      if (cancelled) return
      setUploadedFiles(results.filter((f) => f.content.length > 0))
    }
    loadFiles()
    return () => { cancelled = true }
  }, [currentUserId, currentProjectId])

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

    if (!currentUserId) {
      setError('请先登录或选择用户')
      return
    }

    setError(null)
    setAnalyzing(true)
    setStreamingText('')

    // 创建后端任务
    const { createTask, updateTask } = useTaskQueueStore.getState()
    const task = await createTask({
      type: 'analysis',
      title: uploadedFiles[0]?.path.split('/')[0] || '项目分析',
      projectId: projectId || undefined,
    })

    // Build structured text from uploaded files
    const fileList = uploadedFiles.map(f => f.path).join('\n')
    const fileContents = uploadedFiles.map(f => `=== ${f.path} ===\n${f.content}`).join('\n\n')
    const structure = `项目文件列表：\n${fileList}\n\n文件内容：\n${fileContents}`

    try {
      // 1. 决定是新建项目还是重新分析当前项目
      //    - 在 /project 页面（无 URL projectId）时强制新建，避免残留 currentProjectId 覆盖旧项目
      //    - 在 /project/:id 页面点击重新分析时才复用当前项目
      let activeProjectId = currentProjectId
      if (!activeProjectId || activeProjectId !== projectId) {
        // 项目名优先用 webkitRelativePath 顶层目录；若文件路径无目录（单文件），取文件名（去扩展名）
        const firstPath = uploadedFiles[0]?.path || ''
        const pathSegs = firstPath.split('/').filter(Boolean)
        let projectNameInit: string
        if (pathSegs.length > 1) {
          projectNameInit = pathSegs[0] // 顶层目录名
        } else {
          // 单文件：取文件名去扩展名
          const fname = pathSegs[0] || '未命名项目'
          projectNameInit = fname.replace(/\.[^.]+$/, '')
        }
        // 清理非法字符（与后端校验保持一致）
        projectNameInit = projectNameInit.replace(/[\\/:*?"<>|]/g, '').trim() || '未命名项目'
        const info = await createProject(projectNameInit, projectNameInit, 'other', uploadedFiles.map(f => ({ path: f.path, content: f.content })))
        if (!info) {
          setError('创建项目失败')
          if (task) updateTask(task.id, { status: 'failed', error: '创建项目失败' })
          return
        }
        activeProjectId = info.id
        navigate(`/project/${activeProjectId}`)
      }

      const provider = createProvider(activeModel.baseUrl, activeModel.model)
      const prompt = buildProjectAnalysisPrompt(uploadedFiles.map(f => f.path), structure)

      let chunkCount = 0
      const fullContent = await provider.sendMessage(
        [{ role: 'user', content: prompt }],
        { userId: currentUserId!, modelId: activeModel.id },
        (chunk) => {
          setStreamingText((prev) => prev + chunk)
          chunkCount++
          // 每 10 个 chunk 更新一次进度
          if (task && chunkCount % 10 === 0) {
            updateTask(task.id, { progress: Math.min(chunkCount * 2, 85) })
          }
        },
        // 项目全景分析需要长输出（含 projectManagement 字段）
        { maxTokens: 8192 }
      )

      // 空内容明确报错
      if (!fullContent || !fullContent.trim()) {
        throw new Error('AI 返回内容为空，请检查模型配置或重试（GLM 思考阶段可能被 max_tokens 截断）')
      }

      const parsed = parseAIResponseRobust<ProjectAnalysisOutput | null>(fullContent, null)

      // 补全 AI 可能漏掉的子字段，使类型守卫更容易通过
      if (parsed && typeof parsed === 'object') {
        if (parsed.projectName == null) parsed.projectName = '未命名项目'
        if (parsed.techStack == null) parsed.techStack = { language: [], framework: [], libraries: [], tools: [] }
        const ts = parsed.techStack
        if (!Array.isArray(ts.language)) ts.language = []
        if (!Array.isArray(ts.framework)) ts.framework = []
        if (!Array.isArray(ts.libraries)) ts.libraries = []
        if (!Array.isArray(ts.tools)) ts.tools = []
        if (parsed.architecture == null) parsed.architecture = { pattern: '未知', description: 'AI 未返回架构信息' }
        if (typeof parsed.architecture.pattern !== 'string') parsed.architecture.pattern = '未知'
        if (typeof parsed.architecture.description !== 'string') parsed.architecture.description = 'AI 未返回架构信息'
        if (!Array.isArray(parsed.directoryAnalysis)) parsed.directoryAnalysis = []
        if (typeof parsed.qualityScore !== 'number') parsed.qualityScore = 0
        if (!Array.isArray(parsed.suggestions)) parsed.suggestions = []
        // 补全 projectOverview（项目概览字段）
        if (parsed.projectOverview == null) {
          parsed.projectOverview = {
            projectType: '',
            whatItIs: '',
            purpose: parsed.architecture?.description || '',
            targetUsers: [],
            coreFeatures: [],
            valueProposition: '',
          }
        }
        const pvo = parsed.projectOverview
        if (typeof pvo.projectType !== 'string') pvo.projectType = ''
        if (typeof pvo.whatItIs !== 'string') pvo.whatItIs = ''
        if (typeof pvo.purpose !== 'string') pvo.purpose = ''
        if (!Array.isArray(pvo.targetUsers)) pvo.targetUsers = []
        if (!Array.isArray(pvo.coreFeatures)) pvo.coreFeatures = []
        if (typeof pvo.valueProposition !== 'string') pvo.valueProposition = ''
        // 补全 projectManagement（项目经理视角字段）
        if (parsed.projectManagement == null) parsed.projectManagement = { milestones: [], risks: [], estimatedDuration: '', keyDependencies: [] }
        const pm = parsed.projectManagement
        if (!Array.isArray(pm.milestones)) pm.milestones = []
        if (!Array.isArray(pm.risks)) pm.risks = []
        if (typeof pm.estimatedDuration !== 'string') pm.estimatedDuration = ''
        if (!Array.isArray(pm.keyDependencies)) pm.keyDependencies = []
      }

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
          id: activeProjectId,
          name: projectName,
          displayName: projectName,
          path: `/projects/${projectName}`,
          techStack: allTech,
          structure,
        }
        // 仅更新当前项目元数据，不重置 analysis/buildSteps（避免清空刚加载的内容）
        updateCurrentProjectMeta({
          name: projectName,
          displayName: projectName,
          techStack: allTech,
          structure,
        })

        // Save analysis to backend first
        const backendAnalysis = {
          projectId: activeProjectId,
          generatedAt: new Date().toISOString(),
          projectName,
          projectOverview: parsed.projectOverview,
          techStack: parsed.techStack,
          architecture: parsed.architecture,
          directoryAnalysis: parsed.directoryAnalysis,
          projectManagement: parsed.projectManagement,
          qualityScore: parsed.qualityScore,
          suggestions: parsed.suggestions,
        }
        setAnalysis(backendAnalysis)
        await saveAnalysis()

        // 把 AI 返回的项目名同步写回后端 project.json（避免刷新后项目名回退）
        if (currentUserId) {
          try {
            await updateProject(currentUserId, activeProjectId, { name: projectName, displayName: projectName })
          } catch (err) {
            console.error('[ProjectAnalysis] 回写项目名失败:', err)
          }
        }

        // 标记分析任务完成
        if (task) updateTask(task.id, { status: 'completed', progress: 100 })

        // 触发构建路线生成：AI 自主决定总步数 + 后台批量生成所有步骤（不阻塞 UI）
        // 显式传入 activeProjectId，避免依赖 useParams 闭包（新建项目时 projectId 还是 undefined）
        setBuildPlanGenerating(true)
        void generateBuildPlanAndSteps(parsed, activeModel, activeProjectId)
          .finally(() => setBuildPlanGenerating(false))
        setStreamingText('')
      } else {
        console.error('[ProjectAnalysis] AI 返回内容解析失败，原始输出前 500 字符：', fullContent.slice(0, 500))
        setError(`AI 返回的分析结果格式不正确，无法解析。请检查模型输出或重试。`)
        if (task) updateTask(task.id, { status: 'failed', error: 'AI 返回格式不正确' })
      }
    } catch (err: any) {
      console.error('[ProjectAnalysis] AI 分析异常', err)
      setError(err?.message || 'AI 分析请求失败，请检查网络和 API 配置')
      if (task) updateTask(task.id, { status: 'failed', error: err?.message || 'AI 分析请求失败' })
    } finally {
      setAnalyzing(false)
    }
  // 注意：generateBuildPlanAndSteps 定义在本文之后（前向引用），不能放入依赖数组，否则触发 TDZ
  }, [uploadedFiles, currentProjectId, projectId, currentUserId, getActiveModel, createProject, updateCurrentProjectMeta, setAnalysis, setAnalyzing, saveAnalysis, navigate])

  // 生成单个构建步骤（被 generateAllBuildSteps 串行调用）
  // 返回 true 表示生成成功，false 表示失败；不创建独立任务，不阻塞 UI
  // targetProjectId: 该步所属的项目 ID（后台生成期间用户可能切换项目，需用此 ID 写入正确项目）
  // localStepsRef: 闭包内维护的步骤数组（不依赖 store，避免用户切换项目后 store 被覆盖）
  const generateBuildStep = useCallback(async (
    stepIndex: number,
    totalSteps: number,
    context: ProjectAnalysisOutput | string,
    activeModel: NonNullable<ReturnType<typeof getActiveModel>>,
    targetProjectId: string,
    localSteps: BuildStep[],
    stepPlan?: { title: string; goal: string }
  ): Promise<boolean> => {
    const projectContext = typeof context === 'string' ? context : JSON.stringify(context)
    const provider = createProvider(activeModel.baseUrl, activeModel.model)
    const prompt = buildBuildStepPrompt(stepIndex + 1, totalSteps, projectContext, stepPlan)

    // 鲁棒性增强：单步生成最多重试 3 次（共 3 次尝试），每次失败间隔 1s
    // 上游偶发空响应/思考阶段被截断/网络抖动都能通过重试自愈
    const MAX_ATTEMPTS = 3
    let lastFailReason = '未知原因'

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const fullContent = await provider.sendMessage(
          [{ role: 'user', content: prompt }],
          { userId: currentUserId!, modelId: activeModel.id },
          () => {},
          // 显式传入 maxTokens：build_step 需要长内容（描述+代码+troubleshooting）
          // 给较大值避免被截断；GLM-4 系列上限 8192，GPT-4 系列更大也安全
          { maxTokens: 8192 }
        )

        // 空内容：记录原因并重试
        if (!fullContent || !fullContent.trim()) {
          lastFailReason = 'AI 返回内容为空（可能思考阶段被 max_tokens 截断，或上游 200 但无数据）'
          console.warn(`[ProjectAnalysis] 步骤 ${stepIndex + 1} 第 ${attempt}/${MAX_ATTEMPTS} 次尝试失败：${lastFailReason}`)
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 1000))
            continue
          }
          break
        }

        const parsed = parseAIResponseRobust<BuildStepOutput | null>(fullContent, null)

        if (parsed && isBuildStep(parsed)) {
          // 关键修复：写入前从 store 读取最新 buildSteps 作为基础（仅当用户仍停留在该项目时）
          // 避免后台任务用旧的 localSteps 覆盖用户在其他步骤上的手动修改（竞态条件）
          const currentStoreSteps = useProjectStore.getState().buildSteps
          const isStillOnThisProject = useProjectStore.getState().currentProjectId === targetProjectId
          const baseSteps: BuildStep[] = (isStillOnThisProject && currentStoreSteps.length === totalSteps)
            ? [...currentStoreSteps]
            : (localSteps.length > 0 ? [...localSteps] : new Array(stepIndex + 1).fill(null) as any)
          baseSteps[stepIndex] = {
            step: parsed.step,
            title: parsed.title,
            description: parsed.description,
            commands: parsed.commands,
            status: 'completed',
            code: parsed.code,
            expectedResult: parsed.expectedResult,
            troubleshooting: parsed.troubleshooting,
          }
          // 同步回 localSteps（供后续步骤使用）
          localSteps.length = 0
          localSteps.push(...baseSteps)
          // 仅当用户仍停留在该项目时才更新 store（避免污染已切换到的新项目）
          setBuildStepsIfCurrent(targetProjectId, baseSteps)
          // 每步生成完都持久化到目标项目（不依赖 currentProjectId）
          await saveBuildStepsForProject(targetProjectId, baseSteps)
          if (attempt > 1) {
            console.log(`[ProjectAnalysis] 步骤 ${stepIndex + 1} 在第 ${attempt} 次尝试时成功`)
          }
          return true
        }

        // 解析失败：记录原因并重试
        lastFailReason = `AI 返回内容解析失败（内容长度 ${fullContent.length}，前 200 字符：${fullContent.slice(0, 200)})`
        console.warn(`[ProjectAnalysis] 步骤 ${stepIndex + 1} 第 ${attempt}/${MAX_ATTEMPTS} 次尝试失败：${lastFailReason}`)
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1000))
          continue
        }
        break
      } catch (err: any) {
        lastFailReason = err?.message || String(err)
        console.warn(`[ProjectAnalysis] 步骤 ${stepIndex + 1} 第 ${attempt}/${MAX_ATTEMPTS} 次尝试异常：${lastFailReason}`)
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1000))
          continue
        }
        break
      }
    }

    console.error(`[ProjectAnalysis] 生成构建步骤 ${stepIndex + 1} 最终失败（共 ${MAX_ATTEMPTS} 次尝试）：${lastFailReason}`)
    return false
  }, [setBuildStepsIfCurrent, saveBuildStepsForProject])

  // 阶段1：让 AI 规划构建大纲（AI 自主决定总步数）
  // 鲁棒性增强：最多重试 2 次（共 2 次尝试），失败间隔 1s
  const generateBuildPlan = useCallback(async (
    context: ProjectAnalysisOutput | string,
    activeModel: NonNullable<ReturnType<typeof getActiveModel>>,
    task?: { id: string } | null
  ): Promise<BuildPlanOutput | null> => {
    const { updateTask } = useTaskQueueStore.getState()
    const projectContext = typeof context === 'string' ? context : JSON.stringify(context)
    const provider = createProvider(activeModel.baseUrl, activeModel.model)
    const prompt = buildBuildPlanPrompt(projectContext)

    const MAX_ATTEMPTS = 2
    let lastFailReason = '未知原因'

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        let chunkCount = 0
        const fullContent = await provider.sendMessage(
          [{ role: 'user', content: prompt }],
          { userId: currentUserId!, modelId: activeModel.id },
          () => {
            chunkCount++
            if (task && chunkCount % 10 === 0) {
              updateTask(task.id, { progress: Math.min(chunkCount * 3, 85) })
            }
          },
          { maxTokens: 4096 }
        )

        if (!fullContent || !fullContent.trim()) {
          lastFailReason = 'AI 返回内容为空'
          console.warn(`[ProjectAnalysis] 构建大纲第 ${attempt}/${MAX_ATTEMPTS} 次尝试失败：${lastFailReason}`)
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 1000))
            continue
          }
          break
        }

        const parsed = parseAIResponseRobust<BuildPlanOutput | null>(fullContent, null)
        if (parsed && isBuildPlan(parsed) && parsed.steps.length > 0) {
          // 修正 totalSteps 与 steps.length 不一致
          if (parsed.totalSteps !== parsed.steps.length) {
            parsed.totalSteps = parsed.steps.length
          }
          return parsed
        }

        lastFailReason = `解析失败（内容长度 ${fullContent.length}，前 200 字符：${fullContent.slice(0, 200)})`
        console.warn(`[ProjectAnalysis] 构建大纲第 ${attempt}/${MAX_ATTEMPTS} 次尝试失败：${lastFailReason}`)
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1000))
          continue
        }
        break
      } catch (err: any) {
        lastFailReason = err?.message || String(err)
        console.warn(`[ProjectAnalysis] 构建大纲第 ${attempt}/${MAX_ATTEMPTS} 次尝试异常：${lastFailReason}`)
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1000))
          continue
        }
        break
      }
    }

    console.error(`[ProjectAnalysis] 生成构建大纲最终失败（共 ${MAX_ATTEMPTS} 次尝试）：${lastFailReason}`)
    return null
  }, [])

  // 阶段2：后台串行生成所有步骤（不阻塞 UI，用户可切换页面）
  // 排队机制：即使用户切换项目，后台也会继续完成原项目的生成，写入对应项目（不污染新项目）
  const generateAllBuildSteps = useCallback(async (
    plan: BuildPlanOutput,
    context: ProjectAnalysisOutput | string,
    activeModel: NonNullable<ReturnType<typeof getActiveModel>>,
    targetProjectId: string
  ) => {
    const { createTask, updateTask } = useTaskQueueStore.getState()
    const projectName = plan.projectName || (typeof context === 'string' ? '项目' : context?.projectName) || '项目'
    // 闭包内维护的步骤数组：后台生成的真实数据源，不依赖 store.currentProjectId
    // 用户切换项目后 store 的 buildSteps 会被覆盖，但 localSteps 保留原项目的生成进度
    const localSteps: BuildStep[] = [...useProjectStore.getState().buildSteps]

    const batchTask = await createTask({
      type: 'build_step',
      title: `${projectName} - 后台生成构建教程（0/${plan.totalSteps}）`,
      projectId: targetProjectId,
    })

    let completedCount = 0
    let skippedCount = 0
    for (let i = 0; i < plan.totalSteps; i++) {
      // 关键修复：每次循环开始，若用户仍停留在该项目，从 store 同步最新 buildSteps 到 localSteps
      // 这样用户手动重新生成的 completed 步骤会被同步过来，触发下面的跳过逻辑，不会被后台任务覆盖
      const currentStoreSteps = useProjectStore.getState().buildSteps
      if (useProjectStore.getState().currentProjectId === targetProjectId &&
          currentStoreSteps.length === plan.totalSteps &&
          currentStoreSteps[i] && currentStoreSteps[i]!.status === 'completed' &&
          (!localSteps[i] || localSteps[i]!.status !== 'completed')) {
        localSteps[i] = currentStoreSteps[i]!
      }

      // 跳过已生成完成的步骤（已有有效内容，不重复生成）
      const curStep = localSteps[i]
      if (curStep && curStep.status === 'completed') {
        completedCount++
        skippedCount++
        if (batchTask) {
          updateTask(batchTask.id, {
            progress: Math.round((completedCount / plan.totalSteps) * 100),
            title: `${projectName} - 后台生成构建教程（${completedCount}/${plan.totalSteps}${skippedCount > 0 ? `，跳过${skippedCount}步` : ''}）`,
          })
        }
        continue
      }

      // 标记当前步骤为生成中（仅当用户仍停留在该项目时才更新 UI）
      // 关键修复：从 store 读取最新 buildSteps 作为基础，避免覆盖用户在其他步骤上的手动修改
      if (curStep) {
        const markBaseSteps: BuildStep[] = (useProjectStore.getState().currentProjectId === targetProjectId &&
            currentStoreSteps.length === plan.totalSteps)
          ? [...currentStoreSteps]
          : [...localSteps]
        markBaseSteps[i] = { ...curStep, status: 'in_progress' as const }
        localSteps.length = 0
        localSteps.push(...markBaseSteps)
        setBuildStepsIfCurrent(targetProjectId, markBaseSteps)
      }

      const stepPlan = plan.steps[i]
      const success = await generateBuildStep(i, plan.totalSteps, context, activeModel, targetProjectId, localSteps, stepPlan)

      if (success) {
        completedCount++
        if (batchTask) {
          updateTask(batchTask.id, {
            progress: Math.round((completedCount / plan.totalSteps) * 100),
            title: `${projectName} - 后台生成构建教程（${completedCount}/${plan.totalSteps}）`,
          })
        }
      } else {
        // 单步失败：标记该步为 error，继续下一步（不中断）
        // 关键修复：从 store 读取最新 buildSteps 作为基础，避免覆盖用户在其他步骤上的手动修改
        const latestStoreSteps = useProjectStore.getState().buildSteps
        const failBaseSteps: BuildStep[] = (useProjectStore.getState().currentProjectId === targetProjectId &&
            latestStoreSteps.length === plan.totalSteps)
          ? [...latestStoreSteps]
          : [...localSteps]
        if (failBaseSteps[i]) {
          failBaseSteps[i] = { ...failBaseSteps[i]!, status: 'error' as const, description: '生成失败，请点击重新生成' }
        } else {
          // 兜底：如果该步之前是 null，手动塞一个 error 占位
          while (failBaseSteps.length <= i) failBaseSteps.push(null as any)
          failBaseSteps[i] = {
            step: i + 1,
            title: stepPlan?.title || `第 ${i + 1} 步`,
            description: '生成失败，请点击重新生成',
            commands: [],
            status: 'error' as const,
          }
        }
        localSteps.length = 0
        localSteps.push(...failBaseSteps)
        setBuildStepsIfCurrent(targetProjectId, failBaseSteps)
        await saveBuildStepsForProject(targetProjectId, failBaseSteps)
      }
    }

    if (batchTask) {
      if (completedCount === plan.totalSteps) {
        updateTask(batchTask.id, { status: 'completed', progress: 100 })
      } else {
        updateTask(batchTask.id, { status: 'failed', error: `部分步骤生成失败（${completedCount}/${plan.totalSteps}）` })
      }
    }
  }, [setBuildStepsIfCurrent, saveBuildStepsForProject, generateBuildStep])

  // 统一入口：规划大纲 + 后台批量生成所有步骤
  const generateBuildPlanAndSteps = useCallback(async (
    context: ProjectAnalysisOutput | string,
    activeModel: NonNullable<ReturnType<typeof getActiveModel>>,
    targetProjectId: string
  ) => {
    const { createTask, updateTask } = useTaskQueueStore.getState()
    const projectName = (typeof context === 'string' ? '项目' : context?.projectName) || '项目'

    const planTask = await createTask({
      type: 'build_plan',
      title: `${projectName} - 规划构建路线`,
      projectId: targetProjectId || undefined,
    })

    try {
      // 阶段1：AI 规划大纲（自主决定总步数）
      const plan = await generateBuildPlan(context, activeModel, planTask)
      if (!plan || plan.steps.length === 0) {
        if (planTask) updateTask(planTask.id, { status: 'failed', error: '构建大纲生成失败，请重试' })
        setBuildStepError('构建大纲生成失败，请重试')
        return
      }

      // 用大纲标题创建占位 steps，但保留已有 completed 且标题匹配的步骤（避免重复生成）
      const existingSteps = useProjectStore.getState().buildSteps
      const initialSteps: BuildStep[] = plan.steps.map((s, idx) => {
        const existing = existingSteps[idx]
        // 已生成完成且标题匹配的步骤直接保留，不重新生成
        if (existing && existing.status === 'completed' && existing.title === s.title) {
          return existing
        }
        return {
          step: s.step,
          title: s.title,
          description: '正在后台生成...',
          commands: [],
          status: 'pending' as const,
        }
      })
      // 隔离写入：仅当用户仍停留在原项目时更新 store，始终持久化到原项目
      setBuildStepsIfCurrent(targetProjectId, initialSteps)
      await saveBuildStepsForProject(targetProjectId, initialSteps)

      if (planTask) updateTask(planTask.id, { status: 'completed', progress: 100 })

      // 阶段2：后台串行生成所有步骤（不 await，让它在后台运行，不阻塞 UI）
      void generateAllBuildSteps(plan, context, activeModel, targetProjectId)
    } catch (err: any) {
      if (planTask) updateTask(planTask.id, { status: 'failed', error: err?.message || '规划构建路线失败' })
      setBuildStepError(err?.message || '规划构建路线失败')
    }
  }, [setBuildStepsIfCurrent, saveBuildStepsForProject, generateBuildPlan, generateAllBuildSteps])

  const handleStepNavigate = useCallback((stepIndex: number) => {
    useProjectStore.setState({ currentStep: stepIndex })
    // 后台批量生成已经在进行中，这里只切换查看的步骤
    // 如果该步骤还是占位符（正在后台生成...），UI 会自动显示加载提示
  }, [])

  const handleReanalyze = useCallback(() => {
    if (uploadedFiles.length === 0) return
    analyzeProject()
  }, [analyzeProject, uploadedFiles])

  const handleRename = useCallback(async () => {
    if (!currentUserId || !currentProjectId || !newProjectName.trim()) return
    try {
      await updateProject(currentUserId, currentProjectId, { displayName: newProjectName.trim() })
      // 更新本地项目列表和当前项目显示名
      const updated = projects.map((p) =>
        p.id === currentProjectId ? { ...p, displayName: newProjectName.trim() } : p
      )
      useProjectStore.setState({ projects: updated })
      // 只更新当前项目元数据，不重置 analysis/buildSteps（避免重命名后内容清空）
      updateCurrentProjectMeta({ displayName: newProjectName.trim() })
      setIsRenaming(false)
      setRenameError(null)
    } catch (err: any) {
      setRenameError(err?.message || '重命名失败')
    }
  }, [currentUserId, currentProjectId, newProjectName, projects, updateCurrentProjectMeta])

  const handleDelete = useCallback(async () => {
    if (!currentUserId || !currentProjectId) return
    try {
      await deleteProject(currentUserId, currentProjectId)
      const updated = projects.filter((p) => p.id !== currentProjectId)
      useProjectStore.setState({ projects: updated })
      setProject(null)
      setAnalysis(null)
      setShowDeleteConfirm(false)
      navigate('/project')
    } catch (err: any) {
      setError(err?.message || '删除项目失败')
      setShowDeleteConfirm(false)
    }
  }, [currentUserId, currentProjectId, projects, setProject, setAnalysis, navigate])

  const step = buildSteps[currentStep]
  // 整体构建进度（已生成完成步数 / 总步数），用于确定性进度条，只会往前走
  const completedStepCount = buildSteps.filter(s => s?.status === 'completed').length
  const totalStepCount = buildSteps.length
  const overallBuildProgress = totalStepCount > 0 ? Math.round((completedStepCount / totalStepCount) * 100) : 0
  const techStack = currentProject?.techStack ?? []

  // Analysis data is now directly stored in backend format
  const analysisData = analysis
    ? {
        projectName: analysis.projectName,
        projectOverview: analysis.projectOverview,
        techStack: analysis.techStack,
        architecture: analysis.architecture,
        directoryAnalysis: analysis.directoryAnalysis,
        projectManagement: analysis.projectManagement,
        qualityScore: analysis.qualityScore,
        suggestions: analysis.suggestions,
      }
    : null

  // 仅重新生成构建教程，不重新分析项目
  // AI 自主决定总步数 + 后台批量生成所有步骤（不阻塞 UI）
  const handleRegenerateBuildSteps = useCallback(() => {
    // 并发锁：防止用户多次点击导致大纲生成并发（会覆盖已生成的步骤）
    if (buildPlanGenerating) return
    if (!analysisData || !getActiveModel() || !projectId) return
    setBuildPlanGenerating(true)
    setBuildStepError(null)
    void generateBuildPlanAndSteps(analysisData as any, getActiveModel()!, projectId)
      .finally(() => setBuildPlanGenerating(false))
  }, [analysisData, getActiveModel, projectId, generateBuildPlanAndSteps, buildPlanGenerating])

  // 继续生成未完成的步骤（页面刷新或中断后用于恢复）
  // 不重新规划大纲，直接基于现有 buildSteps 标题，串行生成 pending/error 步骤
  const handleResumeBuildSteps = useCallback(async () => {
    if (buildPlanGenerating) return
    if (!analysisData || !getActiveModel() || !projectId) return
    const activeModel = getActiveModel()
    const existingSteps = useProjectStore.getState().buildSteps
    if (existingSteps.length === 0) return

    setBuildPlanGenerating(true)
    setBuildStepError(null)
    try {
      // 基于现有步骤标题构造伪大纲（让 generateAllBuildSteps 续生成 pending/error 步骤，跳过 completed）
      const plan: BuildPlanOutput = {
        type: 'build_plan',
        totalSteps: existingSteps.length,
        projectName: analysisData.projectName || '项目',
        summary: '',
        steps: existingSteps.map((s, i) => ({
          step: i + 1,
          title: s?.title || `第 ${i + 1} 步`,
          goal: ''
        }))
      }
      await generateAllBuildSteps(plan, analysisData as any, activeModel, projectId)
    } catch (err: any) {
      setBuildStepError(err?.message || '继续生成失败')
    } finally {
      setBuildPlanGenerating(false)
    }
  }, [analysisData, getActiveModel, projectId, generateAllBuildSteps, buildPlanGenerating])

  // 是否存在未完成（pending/error）的步骤
  const hasIncompleteSteps = buildSteps.some((s) => s && (s.status === 'pending' || s.status === 'error'))
  const hasCompletedSteps = buildSteps.some((s) => s?.status === 'completed')

  // 单步重新生成：仅重新生成当前查看的某一步（用于偶发解析失败时手动重试）
  const [singleStepRegenerating, setSingleStepRegenerating] = useState(false)
  const handleRegenerateSingleStep = useCallback(async (stepIndex: number) => {
    const activeModel = getActiveModel()
    if (!activeModel || !analysisData || !projectId) {
      return
    }
    const currentSteps = useProjectStore.getState().buildSteps
    const stepToRegen = currentSteps[stepIndex]
    if (!stepToRegen) {
      return
    }

    setSingleStepRegenerating(true)
    // 标记为生成中（隔离写入：仅当用户仍停留在原项目时更新 store）
    const inProgressSteps = [...currentSteps]
    inProgressSteps[stepIndex] = { ...stepToRegen, status: 'in_progress' as const, description: '正在重新生成...' }
    setBuildStepsIfCurrent(projectId, inProgressSteps)

    try {
      // 复用 generateBuildStep，传入当前 buildSteps 作为 localSteps
      const localSteps = [...inProgressSteps]
      const success = await generateBuildStep(
        stepIndex,
        currentSteps.length,
        analysisData as any,
        activeModel,
        projectId,
        localSteps,
        { title: stepToRegen.title, goal: '' }
      )

      if (!success) {
        // 重新生成失败，标记为 error（generateBuildStep 内部已处理 store 同步，这里补兜底）
        const failedSteps = [...localSteps]
        if (failedSteps[stepIndex]) {
          failedSteps[stepIndex] = { ...stepToRegen, status: 'error' as const, description: '生成失败，请点击重新生成' }
          setBuildStepsIfCurrent(projectId, failedSteps)
        }
      }
    } catch (err: any) {
      console.error('[ProjectAnalysis] 单步重新生成失败:', err?.message || err)
      const failedSteps = [...useProjectStore.getState().buildSteps]
      if (failedSteps[stepIndex]) {
        failedSteps[stepIndex] = { ...stepToRegen, status: 'error' as const, description: `生成失败: ${err?.message || '未知错误'}` }
        setBuildStepsIfCurrent(projectId, failedSteps)
      }
    } finally {
      setSingleStepRegenerating(false)
    }
  }, [analysisData, getActiveModel, projectId, generateBuildStep, setBuildStepsIfCurrent])

  const fileTree: FileTreeNode[] = projectFileTree

  return (
    <div className="min-h-screen bg-cm-bg">
      {/* 删除确认弹窗 */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="mx-4 w-full max-w-sm rounded-2xl border border-cm-border bg-cm-card p-6 shadow-soft-lg"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cm-red/10">
                  <Trash2 size={20} className="text-cm-red" />
                </div>
                <h2 className="text-base font-bold text-cm-text">确认删除项目</h2>
              </div>
              <p className="text-sm text-cm-text-secondary mb-5">
                确定要删除「{currentProject?.displayName || currentProject?.name}」吗？项目文件和分析报告将一并删除，此操作不可恢复。
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg border border-cm-border px-4 py-2 text-sm font-medium text-cm-muted hover:bg-cm-card-alt transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  className="rounded-lg bg-cm-red px-4 py-2 text-sm font-medium text-white hover:bg-cm-red/90 transition-colors"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {isLoading && projectId ? (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6">
          <Loader2 className="h-10 w-10 animate-spin text-cm-accent" />
          <div className="w-64">
            <div className="mb-2 text-center text-sm text-cm-muted">正在加载项目数据...</div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-cm-border">
              <motion.div
                className="h-full rounded-full bg-cm-accent"
                initial={{ width: '0%' }}
                animate={{ width: '95%' }}
                transition={{ duration: 3, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>
      ) : projectId && !currentProject ? (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
          <AlertTriangle size={48} className="text-cm-warning" />
          <h2 className="text-lg font-semibold text-cm-text">项目未找到</h2>
          <button
            onClick={() => navigate('/project')}
            className="rounded-xl bg-cm-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            上传新的项目
          </button>
        </div>
      ) : !projectId && !currentProject ? (
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

              {isAnalyzing && (
                <div className="w-full">
                  <div className="mb-2 flex items-center justify-between text-xs text-cm-muted">
                    <span>AI 正在分析项目...</span>
                    <span className="font-mono">{streamingText.length} 字符</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-cm-border">
                    <motion.div
                      className="h-full rounded-full bg-cm-accent"
                      initial={{ width: '0%' }}
                      animate={{ width: '92%' }}
                      transition={{ duration: 30, ease: 'easeOut' }}
                    />
                  </div>
                </div>
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
          <div className="relative flex flex-col gap-3 border-b border-cm-border bg-cm-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3">
              <FolderSearch size={20} className="text-cm-accent" />
              {isRenaming ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder={currentProject?.displayName || currentProject?.name || ''}
                  className="rounded-lg border border-cm-border bg-cm-bg px-3 py-1 text-sm text-cm-text outline-none focus:border-cm-accent"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename()
                    if (e.key === 'Escape') { setIsRenaming(false); setRenameError(null) }
                  }}
                />
                <button
                  onClick={handleRename}
                  className="rounded-lg bg-cm-accent px-3 py-1 text-xs font-medium text-white hover:bg-cm-accent/90"
                >
                  确认
                </button>
                <button
                  onClick={() => { setIsRenaming(false); setRenameError(null) }}
                  className="rounded-lg border border-cm-border px-3 py-1 text-xs font-medium text-cm-muted hover:bg-cm-card-alt"
                >
                  取消
                </button>
              </div>
            ) : (
              <h1 className="text-lg font-bold text-cm-text">{currentProject?.displayName || currentProject?.name}</h1>
            )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setNewProjectName(currentProject?.displayName || currentProject?.name || '')
                  setIsRenaming(true)
                  setRenameError(null)
                }}
                className="flex items-center gap-1.5 rounded-xl border border-cm-border bg-cm-card px-3 py-2 text-xs text-cm-muted transition-colors hover:border-cm-accent/50 hover:text-cm-accent"
              >
                <Pencil size={14} />
                <span className="hidden sm:inline">重命名</span>
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 rounded-xl border border-cm-border bg-cm-card px-3 py-2 text-xs text-cm-muted transition-colors hover:border-cm-red/50 hover:text-cm-red"
              >
                <Trash2 size={14} />
                <span className="hidden sm:inline">删除</span>
              </button>
              <button
                onClick={handleReanalyze}
                disabled={isAnalyzing}
                className="flex items-center gap-2 rounded-xl border border-cm-border bg-cm-card px-4 py-2 text-sm text-cm-muted transition-colors hover:border-cm-accent/50 hover:text-cm-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={14} className={isAnalyzing ? 'animate-spin' : ''} />
                重新分析
              </button>
            </div>
            {renameError && (
              <div className="mt-2 text-xs text-cm-red sm:absolute sm:right-4 sm:top-full sm:mt-1">
                {renameError}
              </div>
            )}
          </div>

          {/* Tech Stack Bar */}
          {techStack.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-cm-border bg-cm-surface px-4 py-2 sm:px-6">
              <span className="text-xs font-medium text-cm-muted mr-1">技术栈</span>
              {techStack.map((tech) => (
                <span
                  key={tech}
                  className="rounded-full bg-cm-accent-light px-3 py-0.5 text-xs font-medium text-cm-accent"
                >
                  {tech}
                </span>
              ))}
            </div>
          )}

          {/* Analysis status / error hint with progress bar */}
          {error ? (
            <div className="flex items-start gap-2 border-b border-cm-red/30 bg-cm-red/10 px-4 py-2.5 text-sm text-cm-red sm:px-6">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : !analysisData && isAnalyzing ? (
            <div className="border-b border-cm-amber/30 bg-cm-amber/10 px-4 py-2.5 sm:px-6">
              <div className="flex items-center gap-2 text-sm text-cm-amber">
                <Loader2 size={16} className="animate-spin" />
                <span>AI 正在分析项目，请稍候...</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cm-amber/20">
                <motion.div
                  className="h-full rounded-full bg-cm-amber"
                  initial={{ width: '0%' }}
                  animate={{ width: '95%' }}
                  transition={{ duration: 40, ease: 'easeOut' }}
                />
              </div>
            </div>
          ) : !analysisData && !isAnalyzing ? (
            <div className="flex flex-col gap-2 border-b border-cm-amber/30 bg-cm-amber/10 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-center gap-2 text-sm text-cm-amber">
                <AlertTriangle size={16} className="shrink-0" />
                <span>上次分析被中断，分析报告未完成。</span>
              </div>
              <button
                onClick={handleReanalyze}
                disabled={uploadedFiles.length === 0 || !getActiveModel()}
                className="flex items-center gap-1.5 rounded-lg bg-cm-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={14} />
                重新分析
              </button>
            </div>
          ) : analysisData && buildSteps.length === 0 ? (
            <div className="flex flex-col gap-2 border-b border-cm-amber/30 bg-cm-amber/10 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-center gap-2 text-sm text-cm-amber">
                <AlertTriangle size={16} className="shrink-0" />
                <span>构建教程尚未生成或上次生成被中断。</span>
              </div>
              <button
                onClick={handleRegenerateBuildSteps}
                disabled={!getActiveModel() || buildPlanGenerating}
                className="flex items-center gap-1.5 rounded-lg bg-cm-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {buildPlanGenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {buildPlanGenerating ? '规划大纲中...' : '生成构建教程'}
              </button>
            </div>
          ) : null}

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
                        {analysisData?.projectOverview ? (
                          <div className="space-y-4">
                            {/* 项目类型徽章 */}
                            {analysisData.projectOverview.projectType && (
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-cm-accent-light px-3 py-1 text-xs font-medium text-cm-accent">
                                  {analysisData.projectOverview.projectType}
                                </span>
                              </div>
                            )}
                            {/* 项目是什么 */}
                            {analysisData.projectOverview.whatItIs && (
                              <div>
                                <div className="mb-1.5 text-xs font-semibold text-cm-muted">📌 这是什么项目</div>
                                <p className="text-sm leading-relaxed text-cm-text-secondary">
                                  {analysisData.projectOverview.whatItIs}
                                </p>
                              </div>
                            )}
                            {/* 项目用途 */}
                            {analysisData.projectOverview.purpose && (
                              <div>
                                <div className="mb-1.5 text-xs font-semibold text-cm-muted">🎯 用途与价值</div>
                                <p className="text-sm leading-relaxed text-cm-text-secondary">
                                  {analysisData.projectOverview.purpose}
                                </p>
                              </div>
                            )}
                            {/* 目标用户 */}
                            {analysisData.projectOverview.targetUsers.length > 0 && (
                              <div>
                                <div className="mb-1.5 text-xs font-semibold text-cm-muted">👥 目标用户</div>
                                <div className="flex flex-wrap gap-2">
                                  {analysisData.projectOverview.targetUsers.map((u, i) => (
                                    <span key={i} className="rounded-lg bg-cm-card-alt px-2.5 py-1 text-xs text-cm-text-secondary">
                                      {u}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* 核心功能 */}
                            {analysisData.projectOverview.coreFeatures.length > 0 && (
                              <div>
                                <div className="mb-1.5 text-xs font-semibold text-cm-muted">⚙️ 核心功能</div>
                                <ul className="space-y-1.5">
                                  {analysisData.projectOverview.coreFeatures.map((f, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-cm-text-secondary">
                                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cm-accent" />
                                      <span className="leading-relaxed">{f}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {/* 价值亮点 */}
                            {analysisData.projectOverview.valueProposition && (
                              <div className="rounded-xl border border-cm-accent/20 bg-cm-accent-light/30 px-3 py-2.5">
                                <div className="mb-1 text-xs font-semibold text-cm-accent">✨ 价值亮点</div>
                                <p className="text-sm leading-relaxed text-cm-text-secondary">
                                  {analysisData.projectOverview.valueProposition}
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm leading-relaxed text-cm-text-secondary">
                            {analysisData?.architecture?.description || '暂无分析报告，请等待 AI 分析完成。'}
                          </p>
                        )}
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

                      {/* 项目经理视角分析卡片 */}
                      {analysisData?.projectManagement &&
                        (analysisData.projectManagement.milestones.length > 0 ||
                          analysisData.projectManagement.risks.length > 0 ||
                          analysisData.projectManagement.estimatedDuration ||
                          analysisData.projectManagement.keyDependencies.length > 0) && (
                        <GlowCard title="项目管理视角" accent="purple">
                          <div className="space-y-4">
                            {analysisData.projectManagement.estimatedDuration && (
                              <div className="flex items-center gap-2 rounded-xl border border-cm-border bg-cm-card-alt p-3">
                                <Clock size={16} className="shrink-0 text-cm-accent" />
                                <div>
                                  <div className="text-xs font-medium text-cm-muted">开发周期估算</div>
                                  <div className="text-sm font-semibold text-cm-text">
                                    {analysisData.projectManagement.estimatedDuration}
                                  </div>
                                </div>
                              </div>
                            )}

                            {analysisData.projectManagement.milestones.length > 0 && (
                              <div>
                                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-cm-muted">
                                  <Target size={14} />
                                  关键里程碑
                                </div>
                                <ol className="ml-4 list-decimal space-y-1">
                                  {analysisData.projectManagement.milestones.map((m, i) => (
                                    <li key={i} className="text-sm text-cm-text-secondary">{m}</li>
                                  ))}
                                </ol>
                              </div>
                            )}

                            {analysisData.projectManagement.risks.length > 0 && (
                              <div>
                                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-cm-muted">
                                  <AlertCircle size={14} />
                                  主要风险
                                </div>
                                <div className="space-y-2">
                                  {analysisData.projectManagement.risks.map((r, i) => (
                                    <div key={i} className="rounded-xl border border-cm-border bg-cm-card-alt p-3">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm text-cm-text">{r.description}</p>
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                                          r.impact === 'high'
                                            ? 'bg-red-500/10 text-red-400'
                                            : r.impact === 'medium'
                                              ? 'bg-cm-amber/10 text-cm-amber'
                                              : 'bg-cm-green/10 text-cm-green'
                                        }`}>
                                          {r.impact === 'high' ? '高' : r.impact === 'medium' ? '中' : '低'}
                                        </span>
                                      </div>
                                      {r.mitigation && (
                                        <p className="mt-1.5 text-xs text-cm-muted">
                                          <span className="font-medium text-cm-text-secondary">应对：</span>
                                          {r.mitigation}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {analysisData.projectManagement.keyDependencies.length > 0 && (
                              <div>
                                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-cm-muted">
                                  <Link2 size={14} />
                                  关键依赖
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {analysisData.projectManagement.keyDependencies.map((d, i) => (
                                    <span
                                      key={i}
                                      className="rounded-full bg-cm-card-alt px-3 py-1 text-xs text-cm-text-secondary"
                                    >
                                      {d}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </GlowCard>
                      )}

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
                        <div className="lg:w-52 shrink-0">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-xs font-medium uppercase tracking-wider text-cm-muted">
                              构建路线
                            </div>
                            {buildSteps.length > 0 && (
                              <div className="flex items-center gap-1">
                                {/* 续生成按钮：仅当存在未完成步骤且无进行中任务时显示 */}
                                {hasIncompleteSteps && hasCompletedSteps && !buildPlanGenerating && (
                                  <button
                                    onClick={handleResumeBuildSteps}
                                    disabled={!getActiveModel() || buildSteps.some((s) => s?.status === 'in_progress')}
                                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-cm-accent transition-colors hover:bg-cm-accent-light disabled:cursor-not-allowed disabled:opacity-40"
                                    title="继续生成未完成的步骤（不重新规划大纲）"
                                  >
                                    <Play size={11} />
                                    继续生成
                                  </button>
                                )}
                                <button
                                  onClick={handleRegenerateBuildSteps}
                                  disabled={!getActiveModel() || buildPlanGenerating || buildSteps.some((s) => s?.status === 'in_progress')}
                                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-cm-muted transition-colors hover:bg-cm-card-alt hover:text-cm-accent disabled:cursor-not-allowed disabled:opacity-40"
                                  title="重新生成构建教程"
                                >
                                  {buildPlanGenerating ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                                  {buildPlanGenerating ? '规划中...' : '重新生成'}
                                </button>
                              </div>
                            )}
                          </div>
                          {/* Horizontal scroll on mobile, vertical on desktop */}
                          <div className="flex gap-1 overflow-x-auto lg:flex-col scrollbar-thin pb-2 lg:pb-0">
                            {buildSteps.filter(Boolean).map((s) => (
                              <button
                                key={s.step}
                                onClick={() => handleStepNavigate(s.step - 1)}
                                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                                  s.step - 1 === currentStep
                                    ? 'bg-cm-accent-light text-cm-accent'
                                    : 'text-cm-muted hover:bg-cm-card-alt hover:text-cm-text'
                                }`}
                              >
                                {s.status === 'completed' ? (
                                  <CheckCircle2 size={16} className="shrink-0 text-cm-green" />
                                ) : s.status === 'in_progress' ? (
                                  <Loader2 size={16} className="shrink-0 animate-spin text-cm-accent" />
                                ) : s.status === 'error' ? (
                                  <AlertTriangle size={16} className="shrink-0 text-cm-red" />
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
                              {step?.status === 'in_progress' && (
                                <div className="rounded-xl border border-cm-accent/30 bg-cm-accent-light px-4 py-3">
                                  <div className="flex items-center justify-between gap-2 text-sm text-cm-accent">
                                    <div className="flex items-center gap-2">
                                      <Loader2 size={16} className="animate-spin" />
                                      <span>AI 导师正在后台生成这一步的教程...</span>
                                    </div>
                                    <span className="text-xs font-medium">
                                      整体进度 {completedStepCount}/{totalStepCount}
                                    </span>
                                  </div>
                                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cm-accent/20">
                                    <div
                                      className="h-full rounded-full bg-cm-accent transition-all duration-500 ease-out"
                                      style={{ width: `${overallBuildProgress}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {step?.description === '正在后台生成...' && step.status !== 'in_progress' && (
                                <div className="rounded-xl border border-cm-border bg-cm-card-alt px-4 py-3">
                                  <div className="flex items-center justify-between gap-2 text-sm text-cm-muted">
                                    <div className="flex items-center gap-2">
                                      <Loader2 size={16} className="animate-spin" />
                                      <span>该步骤正在队列中等待生成，请稍候...</span>
                                    </div>
                                    <span className="text-xs font-medium">
                                      整体进度 {completedStepCount}/{totalStepCount}
                                    </span>
                                  </div>
                                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cm-border">
                                    <div
                                      className="h-full rounded-full bg-cm-muted transition-all duration-500 ease-out"
                                      style={{ width: `${overallBuildProgress}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {step?.status === 'error' && (
                                <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                                  <AlertTriangle size={16} className="shrink-0" />
                                  {step.description}
                                </div>
                              )}

                              {buildStepError && (
                                <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                                  <AlertTriangle size={16} className="shrink-0" />
                                  {buildStepError}
                                </div>
                              )}

                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cm-accent text-xs font-bold text-white">
                                      {step?.step}
                                    </span>
                                    <span className="text-xs font-medium text-cm-muted">
                                      第 {step?.step} 步 / 共 {buildSteps.length} 步
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => handleRegenerateSingleStep(currentStep)}
                                    disabled={singleStepRegenerating || !getActiveModel() || step?.status === 'in_progress'}
                                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-cm-muted transition-colors hover:bg-cm-card-alt hover:text-cm-accent disabled:cursor-not-allowed disabled:opacity-40"
                                    title="重新生成这一步"
                                  >
                                    {singleStepRegenerating ? (
                                      <Loader2 size={11} className="animate-spin" />
                                    ) : (
                                      <RefreshCw size={11} />
                                    )}
                                    {singleStepRegenerating ? '生成中...' : '重新生成此步'}
                                  </button>
                                </div>
                                <h3 className="mt-2 text-xl font-bold text-cm-text">
                                  {step?.title}
                                </h3>
                                <div className="mt-2 text-sm leading-relaxed text-cm-text-secondary prose prose-sm prose-cm max-w-none">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                    p: ({ children }) => <p className="mb-2">{children}</p>,
                                    ul: ({ children }) => <ul className="ml-4 list-disc space-y-1 mb-2">{children}</ul>,
                                    ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1 mb-2">{children}</ol>,
                                    code: ({ children, className }) => {
                                      const isInline = !className?.includes('language-')
                                      return isInline
                                        ? <code className="rounded bg-cm-card-alt px-1.5 py-0.5 text-xs font-mono text-cm-amber">{children}</code>
                                        : <pre className="rounded-xl border border-cm-border bg-cm-card-alt p-3 overflow-x-auto my-2"><code className="text-xs font-mono">{children}</code></pre>
                                    },
                                    strong: ({ children }) => <strong className="font-semibold text-cm-text">{children}</strong>,
                                    h3: ({ children }) => <h4 className="text-base font-semibold text-cm-text mt-3 mb-1">{children}</h4>,
                                    h4: ({ children }) => <h5 className="text-sm font-semibold text-cm-text mt-2 mb-1">{children}</h5>,
                                  }}>
                                    {step?.description || ''}
                                  </ReactMarkdown>
                                </div>
                              </div>

                              {step?.commands && step.commands.length > 0 && (
                                <div>
                                  <div className="mb-1.5 text-xs font-medium text-cm-muted">在终端执行</div>
                                  <CodeBlock
                                    code={step.commands.join('\n')}
                                    language="bash"
                                    title={step.title}
                                  />
                                </div>
                              )}

                              {step?.code && (
                                <div>
                                  <div className="mb-1.5 text-xs font-medium text-cm-muted">
                                    {step.code.caption || '编写代码'}
                                  </div>
                                  <CodeBlock
                                    code={step.code.content}
                                    language={step.code.language || 'typescript'}
                                    title={step.code.caption || step.title}
                                  />
                                </div>
                              )}

                              {step?.expectedResult && (
                                <div className="rounded-xl border border-cm-green/30 bg-cm-green-light p-4">
                                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-cm-green">
                                    <CheckCircle2 size={14} />
                                    预期效果
                                  </div>
                                  <div className="text-sm text-cm-text-secondary prose prose-sm prose-cm max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                      p: ({ children }) => <p className="mb-1">{children}</p>,
                                      ul: ({ children }) => <ul className="ml-4 list-disc space-y-1 mb-1">{children}</ul>,
                                      ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1 mb-1">{children}</ol>,
                                      code: ({ children, className }) => {
                                        const isInline = !className?.includes('language-')
                                        return isInline
                                          ? <code className="rounded bg-cm-card-alt px-1.5 py-0.5 text-xs font-mono text-cm-amber">{children}</code>
                                          : <pre className="rounded-lg bg-cm-card-alt p-2 overflow-x-auto my-1"><code className="text-xs font-mono">{children}</code></pre>
                                      },
                                      strong: ({ children }) => <strong className="font-semibold text-cm-text">{children}</strong>,
                                    }}>
                                      {step.expectedResult}
                                    </ReactMarkdown>
                                  </div>
                                </div>
                              )}

                              {step?.troubleshooting && step.troubleshooting.length > 0 && (
                                <div className="rounded-xl border border-cm-amber/30 bg-cm-amber-light p-4">
                                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-cm-amber">
                                    <Lightbulb size={14} />
                                    常见问题
                                  </div>
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
                      {buildSteps.filter(Boolean).some((s) => s.code) ? (
                        <div className="space-y-4">
                          <div className="text-xs font-medium uppercase tracking-wider text-cm-muted">
                            AI 生成的代码片段
                          </div>
                          {buildSteps
                            .filter(Boolean)
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
                              请在「从零构建」标签页查看 AI 生成的代码片段
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

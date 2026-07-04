import { create } from 'zustand'
import {
  listProjects,
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  saveProjectAnalysis as apiSaveProjectAnalysis,
  getProjectAnalysis as apiGetProjectAnalysis,
  saveProjectBuildSteps as apiSaveBuildSteps,
  getProjectBuildSteps as apiGetBuildSteps,
  type ProjectInfo,
  type ProjectFile,
  type ProjectManagement,
} from '@/services/api'
import { useUserStore } from './useUserStore'

interface BuildStep {
  step: number
  title: string
  description: string
  commands: string[]
  status: 'pending' | 'in_progress' | 'completed' | 'error'
  code?: {
    language: string
    content: string
    caption?: string
  }
  expectedResult?: string
  troubleshooting?: {
    problem: string
    solution: string
  }[]
}

interface CurrentProject {
  id: string
  name: string
  displayName: string
  path: string
  techStack: string[]
  structure: string
}

interface BackendAnalysis {
  projectId: string
  generatedAt: string
  projectName: string
  // 项目概览（AI 可能不返回，需做兜底）
  projectOverview?: {
    projectType: string
    whatItIs: string
    purpose: string
    targetUsers: string[]
    coreFeatures: string[]
    valueProposition: string
  }
  techStack: {
    language: string[]
    framework: string[]
    libraries: string[]
    tools: string[]
  }
  architecture: {
    pattern: string
    description: string
  }
  directoryAnalysis: {
    description: string
    suggestions: string[]
  }[]
  // 项目经理视角分析结果（AI 可能不返回，需做兜底）
  projectManagement?: ProjectManagement
  qualityScore: number
  suggestions: {
    category: string
    description: string
    priority: 'high' | 'medium' | 'low'
  }[]
}

interface ProjectState {
  projects: ProjectInfo[]
  currentProject: CurrentProject | null
  currentProjectId: string | null
  analysis: BackendAnalysis | null
  buildSteps: BuildStep[]
  currentStep: number
  isAnalyzing: boolean
  isLoading: boolean

  setCurrentProjectId: (id: string | null) => void
  setProject: (project: CurrentProject | null) => void
  updateCurrentProjectMeta: (patch: Partial<CurrentProject>) => void
  setAnalysis: (analysis: BackendAnalysis | null) => void
  setBuildSteps: (steps: BuildStep[]) => void
  nextStep: () => void
  prevStep: () => void
  setAnalyzing: (analyzing: boolean) => void

  loadProjects: () => Promise<void>
  loadProject: (projectId: string) => Promise<void>
  createProject: (
    name: string,
    displayName: string,
    language: string,
    files: ProjectFile[],
  ) => Promise<ProjectInfo | null>
  deleteProject: (projectId: string) => Promise<void>
  saveAnalysis: () => Promise<void>
  saveBuildSteps: () => Promise<void>
  /**
   * 后台生成专用：直接把步骤保存到指定项目（不依赖 currentProjectId）
   * 用于支持用户切换项目后，原项目的后台生成继续写入对应项目
   */
  saveBuildStepsForProject: (projectId: string, steps: BuildStep[]) => Promise<void>
  /**
   * 后台生成专用：仅当 currentProjectId 仍然是指定项目时，才更新 store 的 buildSteps
   * 避免后台生成污染用户已切换到的新项目
   */
  setBuildStepsIfCurrent: (projectId: string, steps: BuildStep[]) => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  currentProjectId: null,
  analysis: null,
  buildSteps: [],
  currentStep: 0,
  isAnalyzing: false,
  isLoading: false,

  setCurrentProjectId: (id) => {
    set({ currentProjectId: id })
  },

  setProject: (project) => {
    set({
      currentProject: project,
      currentProjectId: project ? project.id : null,
      analysis: null,
      buildSteps: [],
      currentStep: 0,
    })
  },

  // 仅更新当前项目的元数据（如 displayName/name/techStack），不重置 analysis/buildSteps
  // 用于重命名、分析后回写项目名等场景，避免误清空已加载内容
  updateCurrentProjectMeta: (patch) => {
    const { currentProject } = get()
    if (!currentProject) return
    set({ currentProject: { ...currentProject, ...patch } })
  },

  setAnalysis: (analysis) => {
    set({ analysis })
  },

  setBuildSteps: (steps) => {
    set({ buildSteps: steps, currentStep: 0 })
  },

  nextStep: () => {
    set((state) => ({
      currentStep: Math.min(state.currentStep + 1, state.buildSteps.length - 1),
    }))
  },

  prevStep: () => {
    set((state) => ({
      currentStep: Math.max(state.currentStep - 1, 0),
    }))
  },

  setAnalyzing: (analyzing) => {
    set({ isAnalyzing: analyzing })
  },

  loadProjects: async () => {
    const userId = useUserStore.getState().currentUserId
    if (!userId) return
    const projects = await listProjects(userId)
    set({ projects })
  },

  loadProject: async (projectId) => {
    const userId = useUserStore.getState().currentUserId
    if (!userId) return

    set({ isLoading: true })
    try {
      // 并行加载项目列表、分析、构建步骤，加超时保护
      const timeoutPromise = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
        ])

      const [projects, analysis, savedBuildSteps] = await Promise.all([
        timeoutPromise(listProjects(userId), 5000, []),
        timeoutPromise(
          apiGetProjectAnalysis(userId, projectId).catch(() => null),
          5000,
          null,
        ),
        timeoutPromise(
          apiGetBuildSteps(userId, projectId).catch(() => null),
          5000,
          null,
        ),
      ])

      const info = projects.find((p) => p.id === projectId)
      if (!info) {
        set({ currentProject: null, currentProjectId: null, analysis: null, buildSteps: [] })
        return
      }

      const analysisData = analysis as BackendAnalysis | null
      const stepsData = (savedBuildSteps && Array.isArray(savedBuildSteps) && savedBuildSteps.length > 0)
        ? (savedBuildSteps as (BuildStep | null)[]).filter((s): s is BuildStep => s != null && typeof s === 'object')
        : []

      const currentProject: CurrentProject = {
        id: info.id,
        name: info.name,
        displayName: info.displayName,
        path: `/projects/${info.name}`,
        techStack: analysisData ? [
          ...(analysisData.techStack?.language ?? []),
          ...(analysisData.techStack?.framework ?? []),
          ...(analysisData.techStack?.libraries ?? []),
          ...(analysisData.techStack?.tools ?? []),
        ] : [],
        structure: '',
      }

      set({
        projects,
        currentProject,
        currentProjectId: info.id,
        analysis: analysisData,
        buildSteps: stepsData,
        currentStep: 0,
      })
    } catch (e) {
      console.error('[ProjectStore] 加载项目失败', e)
      set({ currentProject: null, currentProjectId: null, analysis: null, buildSteps: [] })
    } finally {
      set({ isLoading: false })
    }
  },

  createProject: async (name, displayName, language, files) => {
    const userId = useUserStore.getState().currentUserId
    if (!userId) return null

    const info = await apiCreateProject(userId, {
      name,
      displayName,
      language,
      files,
    })

    set((state) => ({
      projects: [...state.projects, info],
      currentProjectId: info.id,
      currentProject: {
        id: info.id,
        name: info.name,
        displayName: info.displayName,
        path: `/projects/${info.name}`,
        techStack: [],
        structure: '',
      },
      analysis: null,
      buildSteps: [],
      currentStep: 0,
    }))

    return info
  },

  deleteProject: async (projectId) => {
    const userId = useUserStore.getState().currentUserId
    if (!userId) return

    await apiDeleteProject(userId, projectId)
    set((state) => {
      const projects = state.projects.filter((p) => p.id !== projectId)
      const cleared =
        state.currentProjectId === projectId
          ? { currentProject: null, currentProjectId: null, analysis: null, buildSteps: [] }
          : {}
      return { projects, ...cleared }
    })
  },

  saveAnalysis: async () => {
    const userId = useUserStore.getState().currentUserId
    const { currentProjectId, analysis } = get()
    if (!userId || !currentProjectId || !analysis) {
      console.warn('[ProjectStore] saveAnalysis 跳过：', { userId: !!userId, currentProjectId, hasAnalysis: !!analysis })
      return
    }
    try {
      await apiSaveProjectAnalysis(userId, currentProjectId, analysis)
      console.log('[ProjectStore] 分析已保存到后端，projectId:', currentProjectId)
    } catch (err) {
      console.error('[ProjectStore] saveAnalysis 失败:', err)
    }
  },

  saveBuildSteps: async () => {
    const userId = useUserStore.getState().currentUserId
    const { currentProjectId, buildSteps } = get()
    if (!userId || !currentProjectId || buildSteps.length === 0) return
    try {
      await apiSaveBuildSteps(userId, currentProjectId, buildSteps)
      console.log('[ProjectStore] 构建步骤已保存，projectId:', currentProjectId, 'steps:', buildSteps.length)
    } catch (err) {
      console.error('[ProjectStore] saveBuildSteps 失败:', err)
    }
  },

  saveBuildStepsForProject: async (projectId, steps) => {
    const userId = useUserStore.getState().currentUserId
    if (!userId || !projectId || steps.length === 0) return
    try {
      await apiSaveBuildSteps(userId, projectId, steps)
    } catch (err) {
      console.error('[ProjectStore] saveBuildStepsForProject 失败:', err)
    }
  },

  setBuildStepsIfCurrent: (projectId, steps) => {
    const { currentProjectId } = get()
    // 仅当用户仍停留在该项目时才更新 store，避免污染已切换到的新项目
    if (currentProjectId === projectId) {
      // 钳制 currentStep 到合法范围，避免新数组比旧数组短时索引越界
      const safeStep = steps.length > 0 ? Math.min(get().currentStep, steps.length - 1) : 0
      set({ buildSteps: steps, currentStep: safeStep })
    }
  },
}))

export type { BuildStep, CurrentProject, BackendAnalysis }

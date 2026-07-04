import { create } from 'zustand'
import { db, type ProjectAnalysis } from '../db'

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
  name: string
  path: string
  techStack: string[]
  structure: string
}

interface ProjectState {
  currentProject: CurrentProject | null
  analysis: ProjectAnalysis | null
  buildSteps: BuildStep[]
  currentStep: number
  isAnalyzing: boolean

  setProject: (project: CurrentProject | null) => void
  setAnalysis: (analysis: ProjectAnalysis | null) => void
  setBuildSteps: (steps: BuildStep[]) => void
  nextStep: () => void
  prevStep: () => void
  setAnalyzing: (analyzing: boolean) => void
  loadAnalysis: (projectName: string) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  analysis: null,
  buildSteps: [],
  currentStep: 0,
  isAnalyzing: false,

  setProject: (project) => {
    set({ currentProject: project, analysis: null, buildSteps: [], currentStep: 0 })
  },

  setAnalysis: (analysis) => {
    set({ analysis })

    // 异步保存到数据库
    if (analysis) {
      db.projectAnalyses.put(analysis).catch((error) => {
        console.error('保存项目分析失败:', error)
      })
    }
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

  loadAnalysis: async (projectName) => {
    try {
      const analyses = await db.projectAnalyses
        .where('projectName')
        .equals(projectName)
        .toArray()

      if (analyses.length > 0) {
        const analysis = analyses[0]
        set({
          analysis,
          buildSteps: JSON.parse(analysis.buildSteps || '[]'),
        })
      }
    } catch (error) {
      console.error('加载项目分析失败:', error)
    }
  },
}))

export type { BuildStep, CurrentProject }

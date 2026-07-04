import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LessonSection } from '@/types/ai-output'
import { useUserStore } from './useUserStore'

// 同步到后端的辅助函数
function syncToBackend() {
  try {
    const { syncToBackend } = useUserStore.getState()
    syncToBackend()
  } catch {}
}

/** 用户填写的学情表单 */
export interface LearningProfile {
  language: string
  background: string       // 是否有基础
  goal: string             // 学习目标
  dailyMinutes: number     // 每日学习时长
  style: 'balanced' | 'theory' | 'practice'  // 学习风格
}

/** AI 生成的月度计划 */
export interface MonthPlan {
  month: number
  title: string
  topics: string[]
}

/** AI 生成的学习路径 */
export interface AILearningPath {
  id: string
  profile: LearningProfile
  months: MonthPlan[]
  totalDays: number
  overview: string         // AI 生成的整体概述
  createdAt: string
}

/** AI 生成的每日课程 */
export interface AIDailyLesson {
  dayNumber: number
  title: string
  content: string          // 降级用
  starterCode: string      // 练习起始代码
  hint: string             // 提示
  expectedOutput: string   // 预期输出描述
  exercise?: {
    description: string
    starterCode: string
    hint: string
    expectedOutput: string
  }
}

/** 每日课程练习 */
export interface LessonExercise {
  description: string
  starterCode: string
  hint: string
  expectedOutput: string
}

interface LearningState {
  profile: LearningProfile | null
  learningPath: AILearningPath | null
  currentDay: number
  streak: number
  totalXP: number
  level: number
  completedDays: number[]
  isGenerating: boolean
  // 每日课程持久化状态（防止组件重渲染丢失）
  currentLessonSections: LessonSection[]
  currentExercise: LessonExercise | null
  currentLessonDay: number | null

  setProfile: (profile: LearningProfile) => void
  setLearningPath: (path: AILearningPath | null) => void
  setGenerating: (v: boolean) => void
  setLessonData: (sections: LessonSection[], exercise: LessonExercise | null, day: number) => void
  clearLessonData: () => void
  completeDay: (dayNumber: number) => void
  addXP: (amount: number) => void
  reset: () => void
}

export const useLearningStore = create<LearningState>()(
  persist(
    (set, get) => ({
      profile: null,
      learningPath: null,
      currentDay: 1,
      streak: 0,
      totalXP: 0,
      level: 1,
      completedDays: [],
      isGenerating: false,
      currentLessonSections: [],
      currentExercise: null,
      currentLessonDay: null,

      setProfile: (profile) => { set((state) => ({
        profile,
        learningPath: profile === null ? null : state.learningPath,
      })); syncToBackend() },
      setLearningPath: (path) => { set({ learningPath: path, currentDay: 1, completedDays: [] }); syncToBackend() },
      setGenerating: (v) => set({ isGenerating: v }),
      setLessonData: (sections, exercise, day) => { set({
        currentLessonSections: sections,
        currentExercise: exercise,
        currentLessonDay: day,
      }); syncToBackend() },
      clearLessonData: () => { set({
        currentLessonSections: [],
        currentExercise: null,
        currentLessonDay: null,
      }); syncToBackend() },

      completeDay: (dayNumber) => {
        const { completedDays, streak } = get()
        if (completedDays.includes(dayNumber)) return
        const newCompleted = [...completedDays, dayNumber].sort((a, b) => a - b)
        const newCurrentDay = dayNumber + 1
        set({
          completedDays: newCompleted,
          currentDay: newCurrentDay,
          streak: streak + 1,
        })
        get().addXP(50)
        syncToBackend()
      },

      addXP: (amount) => {
        set((state) => {
          const newXP = state.totalXP + amount
          const newLevel = Math.floor(newXP / 200) + 1
          return { totalXP: newXP, level: newLevel }
        })
        syncToBackend()
      },

      reset: () => set({
        profile: null,
        learningPath: null,
        currentDay: 1,
        streak: 0,
        totalXP: 0,
        level: 1,
        completedDays: [],
        currentLessonSections: [],
        currentExercise: null,
        currentLessonDay: null,
      }),
    }),
    { name: 'codementor-learning' }
  )
)

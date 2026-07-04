import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LessonSection } from '@/types/ai-output'
import { useUserStore } from './useUserStore'

// 同步到后端的辅助函数
// immediate=true 时立即同步（用于关键数据，如学习路径生成），否则走防抖
let syncTimer: ReturnType<typeof setTimeout> | null = null
function syncToBackend(immediate = false) {
  try {
    const { syncToBackend: userSync } = useUserStore.getState()
    if (immediate) {
      // 立即同步：先取消待执行的防抖，然后直接调用
      if (syncTimer) { clearTimeout(syncTimer); syncTimer = null }
      userSync()
    } else {
      userSync()
    }
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
  // 按天数缓存所有已生成的课程，避免重新进入时重复调用 AI 生成
  lessonsByDay: Record<string, { sections: LessonSection[]; exercise: LessonExercise }>
  // 正在生成中的课程标记（key: language-day），防止组件卸载重挂导致重复生成
  generatingLessons: Record<string, boolean>

  setProfile: (profile: LearningProfile | null) => void
  setLearningPath: (path: AILearningPath | null) => void
  setGenerating: (v: boolean) => void
  setLessonData: (sections: LessonSection[], exercise: LessonExercise | null, day: number, language: string) => void
  getLessonData: (language: string, day: number) => { sections: LessonSection[]; exercise: LessonExercise } | null
  isLessonGenerating: (language: string, day: number) => boolean
  setLessonGenerating: (language: string, day: number, generating: boolean) => void
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
      lessonsByDay: {},
      generatingLessons: {},

      setProfile: (profile) => { set((state) => ({
        profile,
        learningPath: profile === null ? null : state.learningPath,
      })); syncToBackend(true) },
      setLearningPath: (path) => { set({ learningPath: path, currentDay: 1, completedDays: [] }); syncToBackend(true) },
      setGenerating: (v) => set({ isGenerating: v }),
      setLessonData: (sections, exercise, day, language) => {
        const key = `${language}-${day}`
        set((state) => ({
          currentLessonSections: sections,
          currentExercise: exercise,
          currentLessonDay: day,
          lessonsByDay: { ...state.lessonsByDay, [key]: { sections, exercise: exercise! } },
          // 课程生成完成，清除生成中标记
          generatingLessons: { ...state.generatingLessons, [key]: false },
        }))
        syncToBackend(true)
      },
      getLessonData: (language, day) => {
        const key = `${language}-${day}`
        return get().lessonsByDay[key] || null
      },
      isLessonGenerating: (language, day) => {
        const key = `${language}-${day}`
        return !!get().generatingLessons[key]
      },
      setLessonGenerating: (language, day, generating) => {
        const key = `${language}-${day}`
        set((state) => ({
          generatingLessons: { ...state.generatingLessons, [key]: generating },
        }))
        // 不调 syncToBackend，避免防抖期间状态丢失
      },
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
        lessonsByDay: {},
        generatingLessons: {},
      }),
    }),
    { name: 'codementor-learning' }
  )
)

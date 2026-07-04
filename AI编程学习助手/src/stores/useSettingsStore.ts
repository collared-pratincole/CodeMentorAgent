import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type UserModel, makeModelId } from '@/data/models'
import { useUserStore } from './useUserStore'

export interface EnvConfig {
  id: string
  languageId: string
  label: string
  version: string
  installPath: string
  detectCommand: string
  runCommand: string
  installCommand: string
  status: 'unknown' | 'installed' | 'not_installed'
}

type Theme = 'light' | 'dark'
type LearningStyle = 'balanced' | 'theory' | 'practice'
type DifficultyPreference = 'progressive' | 'standard' | 'challenge'
type AccentColor = 'green' | 'purple' | 'amber'

interface SettingsState {
  theme: Theme
  accentColor: AccentColor
  editorFontSize: number
  sidebarCollapsed: boolean
  // 模型配置
  userModels: UserModel[]
  activeModelId: string | null
  modelParams: {
    temperature: number
    maxTokens: number
  }
  // 学习偏好
  learningPrefs: {
    dailyMinutes: number
    style: LearningStyle
    difficulty: DifficultyPreference
  }
  // 本地环境配置
  envConfigs: EnvConfig[]
  // 启动向导
  setupCompleted: boolean
  addEnvConfig: (config: Omit<EnvConfig, 'id'>) => string
  removeEnvConfig: (id: string) => void
  updateEnvConfig: (id: string, updates: Partial<EnvConfig>) => void
  // Actions
  setTheme: (theme: Theme) => void
  setAccentColor: (color: AccentColor) => void
  setEditorFontSize: (size: number) => void
  toggleSidebar: () => void
  addUserModel: (model: Omit<UserModel, 'id'>) => string
  updateUserModel: (id: string, updates: Partial<UserModel>) => void
  removeUserModel: (id: string) => void
  setActiveModel: (id: string | null) => void
  setModelParams: (params: Partial<SettingsState['modelParams']>) => void
  setLearningPrefs: (prefs: Partial<SettingsState['learningPrefs']>) => void
  setSetupCompleted: (v: boolean) => void
  getActiveModel: () => UserModel | null
  resetToDefaults: () => void
}

const defaultState = {
  theme: 'light' as Theme,
  accentColor: 'amber' as AccentColor,
  editorFontSize: 14,
  sidebarCollapsed: false,
  userModels: [] as UserModel[],
  activeModelId: null as string | null,
  modelParams: {
    temperature: 0.7,
    maxTokens: 4096,
  },
  learningPrefs: {
    dailyMinutes: 30,
    style: 'balanced' as LearningStyle,
    difficulty: 'standard' as DifficultyPreference,
  },
  envConfigs: [] as EnvConfig[],
  setupCompleted: false,
}

// 同步到后端的辅助函数
function syncToBackend() {
  try {
    const { syncToBackend } = useUserStore.getState()
    syncToBackend()
  } catch {}
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultState,
      setTheme: (theme) => { set({ theme }); syncToBackend() },
      setAccentColor: (color) => { set({ accentColor: color }); syncToBackend() },
      setEditorFontSize: (size) => { set({ editorFontSize: size }); syncToBackend() },
      toggleSidebar: () => { set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })); syncToBackend() },

      addUserModel: (model) => {
        const id = makeModelId(model.providerId, model.model)
        const existing = get().userModels.find((m) => m.id === id)
        if (existing) {
          set((s) => ({
            userModels: s.userModels.map((m) => m.id === id ? { ...m, ...model, id } : m),
          }))
        } else {
          set((s) => ({
            userModels: [...s.userModels, { ...model, id }],
          }))
        }
        if (get().userModels.length === 1 || !get().activeModelId) {
          set({ activeModelId: id })
        }
        syncToBackend()
        return id
      },

      updateUserModel: (id, updates) => {
        set((s) => ({
          userModels: s.userModels.map((m) => m.id === id ? { ...m, ...updates } : m),
        }))
        syncToBackend()
      },

      removeUserModel: (id) => {
        set((s) => {
          const newModels = s.userModels.filter((m) => m.id !== id)
          return {
            userModels: newModels,
            activeModelId: s.activeModelId === id
              ? (newModels[0]?.id ?? null)
              : s.activeModelId,
          }
        })
        syncToBackend()
      },

      setActiveModel: (id) => { set({ activeModelId: id }); syncToBackend() },

      setModelParams: (params) =>
        { set((s) => ({ modelParams: { ...s.modelParams, ...params } })); syncToBackend() },

      setLearningPrefs: (prefs) =>
        { set((s) => ({ learningPrefs: { ...s.learningPrefs, ...prefs } })); syncToBackend() },

      setSetupCompleted: (v) => { set({ setupCompleted: v }); syncToBackend() },

      addEnvConfig: (config) => {
        const id = `env-${config.languageId}-${Date.now()}`
        set((s) => ({ envConfigs: [...s.envConfigs, { ...config, id }] }))
        syncToBackend()
        return id
      },
      removeEnvConfig: (id) => {
        set((s) => ({ envConfigs: s.envConfigs.filter((e) => e.id !== id) }))
        syncToBackend()
      },
      updateEnvConfig: (id, updates) => {
        set((s) => ({ envConfigs: s.envConfigs.map((e) => e.id === id ? { ...e, ...updates } : e) }))
        syncToBackend()
      },

      getActiveModel: () => {
        const { userModels, activeModelId } = get()
        return userModels.find((m) => m.id === activeModelId) ?? null
      },

      resetToDefaults: () => set(defaultState),
    }),
    { name: 'codementor-settings' }
  )
)

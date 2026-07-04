import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type UserModel, makeModelId } from '@/data/models'
import { useUserStore } from './useUserStore'
import {
  saveModelApiKey as apiSaveModelApiKey,
  deleteModelApiKey as apiDeleteModelApiKey,
  listApiKeyPreviews as apiListApiKeyPreviews,
} from '@/services/api'

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
  // ===== API Key 安全存储相关 =====
  // 保存某个模型的 apiKey 到后端（前端不持有明文，只存脱敏预览到 store）
  saveModelApiKey: (modelId: string, apiKey: string) => Promise<boolean>
  // 删除某个模型的 apiKey（后端 + 前端预览）
  deleteModelApiKey: (modelId: string) => Promise<void>
  // 从后端拉取所有模型的 apiKey 脱敏预览，更新到 store
  loadApiKeyPreviews: () => Promise<void>
  // 自动迁移：检测 localStorage 里残留的明文 apiKey，迁移到后端，成功后清除
  migrateLegacyApiKeys: () => Promise<void>
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
function syncToBackend(immediate = false) {
  try {
    const { syncToBackend } = useUserStore.getState()
    syncToBackend(immediate)
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
        // 安全改动：model 参数不再含 apiKey 字段（UserModel 已移除）
        // apiKey 由调用方通过 saveModelApiKey 单独保存到后端
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
        syncToBackend(true)
        return id
      },

      updateUserModel: (id, updates) => {
        set((s) => ({
          userModels: s.userModels.map((m) => m.id === id ? { ...m, ...updates } : m),
        }))
        syncToBackend(true)
      },

      removeUserModel: (id) => {
        // 同步删除后端存储的 apiKey（不阻塞，失败也继续）
        void get().deleteModelApiKey(id)
        set((s) => {
          const newModels = s.userModels.filter((m) => m.id !== id)
          return {
            userModels: newModels,
            activeModelId: s.activeModelId === id
              ? (newModels[0]?.id ?? null)
              : s.activeModelId,
          }
        })
        syncToBackend(true)
      },

      setActiveModel: (id) => { set({ activeModelId: id }); syncToBackend(true) },

      setModelParams: (params) =>
        { set((s) => ({ modelParams: { ...s.modelParams, ...params } })); syncToBackend(true) },

      setLearningPrefs: (prefs) =>
        { set((s) => ({ learningPrefs: { ...s.learningPrefs, ...prefs } })); syncToBackend() },

      setSetupCompleted: (v) => { set({ setupCompleted: v }); syncToBackend(true) },

      addEnvConfig: (config) => {
        const id = `env-${config.languageId}-${Date.now()}`
        set((s) => ({ envConfigs: [...s.envConfigs, { ...config, id }] }))
        syncToBackend(true)
        return id
      },
      removeEnvConfig: (id) => {
        set((s) => ({ envConfigs: s.envConfigs.filter((e) => e.id !== id) }))
        syncToBackend(true)
      },
      updateEnvConfig: (id, updates) => {
        set((s) => ({ envConfigs: s.envConfigs.map((e) => e.id === id ? { ...e, ...updates } : e) }))
        syncToBackend(true)
      },

      getActiveModel: () => {
        const { userModels, activeModelId } = get()
        return userModels.find((m) => m.id === activeModelId) ?? null
      },

      // ===== API Key 安全存储实现 =====

      saveModelApiKey: async (modelId, apiKey) => {
        const userId = useUserStore.getState().currentUserId
        if (!userId) return false
        const result = await apiSaveModelApiKey(userId, modelId, apiKey)
        if (!result) return false
        // 只把脱敏预览存到 store，不存明文
        set((s) => ({
          userModels: s.userModels.map((m) =>
            m.id === modelId
              ? { ...m, hasApiKey: true, apiKeyPreview: result.preview }
              : m
          ),
        }))
        return true
      },

      deleteModelApiKey: async (modelId) => {
        const userId = useUserStore.getState().currentUserId
        if (!userId) return
        await apiDeleteModelApiKey(userId, modelId)
        set((s) => ({
          userModels: s.userModels.map((m) =>
            m.id === modelId
              ? { ...m, hasApiKey: false, apiKeyPreview: undefined }
              : m
          ),
        }))
      },

      loadApiKeyPreviews: async () => {
        const userId = useUserStore.getState().currentUserId
        if (!userId) return
        const previews = await apiListApiKeyPreviews(userId)
        // 前端 safeId 等效：与后端 safeId 保持一致，去掉非 [a-zA-Z0-9_-] 字符
        // 用于兼容旧版数据（旧版用 safeId 后的 modelId 作为 apiKeys.json 的 key）
        const safeIdLocal = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '')
        set((s) => ({
          userModels: s.userModels.map((m) => {
            // 优先用原始 m.id 匹配（新版数据），回退到 safeId 后的 key（旧版数据）
            const preview = previews[m.id] || previews[safeIdLocal(m.id)]
            return preview
              ? { ...m, hasApiKey: true, apiKeyPreview: preview }
              : { ...m, hasApiKey: false, apiKeyPreview: undefined }
          }),
        }))
      },

      // 自动迁移：检测 localStorage 持久化的旧版 userModels 里残留的明文 apiKey
      // 迁移到后端存储，成功后从 store 清除明文字段
      // 触发时机：用户登录后由 App.tsx 调用一次
      migrateLegacyApiKeys: async () => {
        const userId = useUserStore.getState().currentUserId
        if (!userId) return
        const { userModels } = get()
        // 旧版数据在 localStorage 里可能仍有 apiKey 字段（persist 自动恢复）
        // 用 as any 绕过类型检查读取
        const legacyModels = userModels.filter((m) => (m as any).apiKey)
        if (legacyModels.length === 0) return

        let migratedCount = 0
        for (const m of legacyModels) {
          const legacyKey = (m as any).apiKey as string
          const ok = await apiSaveModelApiKey(userId, m.id, legacyKey)
          if (ok) {
            migratedCount++
            set((s) => ({
              userModels: s.userModels.map((mm) =>
                mm.id === m.id
                  ? {
                      ...mm,
                      hasApiKey: true,
                      apiKeyPreview: ok.preview,
                      // 清除明文 apiKey 字段
                      ...(mm as any).apiKey ? { apiKey: undefined } : {},
                    }
                  : mm
              ),
            }))
          }
        }
        if (migratedCount > 0) {
          console.log(`[SettingsStore] 自动迁移 ${migratedCount} 个 apiKey 到后端存储`)
          // 强制 persist 重新写入 localStorage，清除明文 apiKey
          syncToBackend(true)
        }
      },

      resetToDefaults: () => set(defaultState),
    }),
    { name: 'codementor-settings' }
  )
)

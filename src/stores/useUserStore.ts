import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { listUsers, createUser, getUserData, saveUserSettings, saveUserLearning, deleteUser, type UserInfo } from '@/services/api'
import { useSettingsStore } from './useSettingsStore'
import { useLearningStore } from './useLearningStore'
import { useChatStore } from './useChatStore'

interface UserState {
  // 当前用户
  currentUserId: string | null
  currentUserName: string | null
  currentUserAvatar: string | null
  // 用户列表
  users: UserInfo[]
  // 加载状态
  loading: boolean
  dataLoaded: boolean
  // Actions
  loadUsers: () => Promise<void>
  selectUser: (userId: string) => Promise<void>
  createAndSelectUser: (name: string, avatar?: string) => Promise<void>
  removeUser: (userId: string) => Promise<void>
  syncToBackend: (immediate?: boolean) => void
  logout: () => void
}

let syncTimer: ReturnType<typeof setTimeout> | null = null

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      currentUserId: null,
      currentUserName: null,
      currentUserAvatar: null,
      users: [],
      loading: false,
      dataLoaded: false,

      loadUsers: async () => {
        set({ loading: true })
        try {
          const users = await listUsers()
          set({ users, loading: false })
        } catch {
          set({ loading: false })
        }
      },

      selectUser: async (userId: string) => {
        set({ loading: true })
        try {
          const data = await getUserData(userId)
          if (!data) {
            set({ loading: false })
            return
          }

          // 设置当前用户
          set({
            currentUserId: data.id,
            currentUserName: data.name,
            currentUserAvatar: data.avatar,
            loading: false,
            dataLoaded: true,
          })
          // 维护全局变量，供 chat store 防抖同步使用
          ;(window as any).__CM_CURRENT_USER__ = data.id

          // 将后端数据填充到 Zustand stores
          if (data.settings) {
            const settingsStore = useSettingsStore.getState()
            useSettingsStore.setState({
              ...settingsStore,
              ...data.settings,
              // 保留 actions（不覆盖函数）
            })
          }

          // 后端 settings 里的 userModels 可能不含 hasApiKey/apiKeyPreview 字段（旧版数据）
          // 从后端 apiKeys.json 重新拉取权威的脱敏预览，确保 UI 显示正确
          void useSettingsStore.getState().loadApiKeyPreviews()

          if (data.learning) {
            const learningStore = useLearningStore.getState()
            const backendLearning = data.learning as any
            const backendHasLearningPath = !!backendLearning.learningPath
            const frontendHasLearningPath = !!learningStore.learningPath
            // 跨设备同步策略：
            // - 后端有 learningPath：后端优先（设备 A 已同步）
            // - 后端无 learningPath 但前端有：保留前端数据并反向同步到后端（前端数据未同步）
            // - 都没有：用后端默认值
            if (backendHasLearningPath) {
              const backendLessonsByDay = backendLearning.lessonsByDay || {}
              const frontendLessonsByDay = learningStore.lessonsByDay || {}
              const mergedLessonsByDay = {
                ...frontendLessonsByDay,
                ...backendLessonsByDay,
                ...Object.fromEntries(
                  Object.entries(frontendLessonsByDay).filter(([k]) =>
                    learningStore.generatingLessons?.[k] === true
                  )
                ),
              }
              useLearningStore.setState({
                ...learningStore,
                ...backendLearning,
                lessonsByDay: mergedLessonsByDay,
              })
            } else if (frontendHasLearningPath) {
              // 前端有数据但后端没有，保留前端并反向同步
              const mergedLessonsByDay = {
                ...(backendLearning.lessonsByDay || {}),
                ...learningStore.lessonsByDay,
              }
              useLearningStore.setState({
                ...learningStore,
                ...backendLearning,
                // 保留前端的关键学习数据
                profile: learningStore.profile,
                learningPath: learningStore.learningPath,
                currentDay: learningStore.currentDay,
                completedDays: learningStore.completedDays,
                streak: learningStore.streak,
                totalXP: learningStore.totalXP,
                level: learningStore.level,
                lessonsByDay: mergedLessonsByDay,
              })
              // 反向同步：把前端数据推到后端
              get().syncToBackend(true)
            } else {
              useLearningStore.setState({
                ...learningStore,
                ...backendLearning,
              })
            }
          }

          // 从后端加载 AI 对话历史（实现跨设备同步）
          await useChatStore.getState().loadFromBackend(data.id)

          // 标记 setup 已完成
          useSettingsStore.getState().setSetupCompleted(true)
        } catch {
          set({ loading: false })
        }
      },

      createAndSelectUser: async (name: string, avatar?: string) => {
        set({ loading: true })
        try {
          const data = await createUser(name, avatar)
          set({
            currentUserId: data.id,
            currentUserName: data.name,
            currentUserAvatar: data.avatar,
            loading: false,
            dataLoaded: true,
            users: [...get().users, { id: data.id, name: data.name, avatar: data.avatar, createdAt: data.createdAt }],
          })
          ;(window as any).__CM_CURRENT_USER__ = data.id
          // 新用户清空 chat 本地缓存
          useChatStore.getState().clearLocal()
          // 不在这里设置 setupCompleted，让用户走完环境配置流程
          // 首次创建后立即同步一次
          get().syncToBackend()
        } catch {
          set({ loading: false })
        }
      },

      removeUser: async (userId: string) => {
        await deleteUser(userId)
        const newUsers = get().users.filter(u => u.id !== userId)
        if (get().currentUserId === userId) {
          set({ currentUserId: null, currentUserName: null, currentUserAvatar: null, users: newUsers, dataLoaded: false })
          ;(window as any).__CM_CURRENT_USER__ = undefined
          useChatStore.getState().clearLocal()
          useSettingsStore.getState().setSetupCompleted(false)
        } else {
          set({ users: newUsers })
        }
      },

      syncToBackend: (immediate = false) => {
    const { currentUserId } = get()
    if (!currentUserId) return

    const doSync = () => {
      const settingsState = useSettingsStore.getState()
      const learningState = useLearningStore.getState()

      // 提取纯数据（排除函数）
      const settingsData: Record<string, any> = {}
      for (const key of Object.keys(settingsState)) {
        if (typeof (settingsState as any)[key] !== 'function') {
          settingsData[key] = (settingsState as any)[key]
        }
      }

      const learningData: Record<string, any> = {}
      for (const key of Object.keys(learningState)) {
        if (typeof (learningState as any)[key] !== 'function') {
          learningData[key] = (learningState as any)[key]
        }
      }

      saveUserSettings(currentUserId, settingsData)
      saveUserLearning(currentUserId, learningData)
    }

    // immediate=true 时跳过防抖立即同步（用于关键数据如学习路径生成）
    if (immediate) {
      if (syncTimer) { clearTimeout(syncTimer); syncTimer = null }
      doSync()
      return
    }

    // 防抖：500ms 内只同步一次
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(doSync, 500)
  },

      logout: () => {
        // 先同步当前数据
        get().syncToBackend()
        set({
          currentUserId: null,
          currentUserName: null,
          currentUserAvatar: null,
          dataLoaded: false,
        })
        ;(window as any).__CM_CURRENT_USER__ = undefined
        useChatStore.getState().clearLocal()
        useSettingsStore.getState().setSetupCompleted(false)
      },
    }),
    { name: 'codementor-current-user' }
  )
)

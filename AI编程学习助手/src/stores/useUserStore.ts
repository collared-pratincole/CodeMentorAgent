import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { listUsers, createUser, getUserData, saveUserSettings, saveUserLearning, deleteUser, type UserInfo } from '@/services/api'
import { useSettingsStore } from './useSettingsStore'
import { useLearningStore } from './useLearningStore'

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
  syncToBackend: () => void
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

          // 将后端数据填充到 Zustand stores
          if (data.settings) {
            const settingsStore = useSettingsStore.getState()
            useSettingsStore.setState({
              ...settingsStore,
              ...data.settings,
              // 保留 actions（不覆盖函数）
            })
          }

          if (data.learning) {
            const learningStore = useLearningStore.getState()
            useLearningStore.setState({
              ...learningStore,
              ...data.learning,
            })
          }

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
          useSettingsStore.getState().setSetupCompleted(false)
        } else {
          set({ users: newUsers })
        }
      },

      syncToBackend: () => {
        const { currentUserId } = get()
        if (!currentUserId) return

        // 防抖：500ms 内只同步一次
        if (syncTimer) clearTimeout(syncTimer)
        syncTimer = setTimeout(() => {
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
        }, 500)
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
        useSettingsStore.getState().setSetupCompleted(false)
      },
    }),
    { name: 'codementor-current-user' }
  )
)

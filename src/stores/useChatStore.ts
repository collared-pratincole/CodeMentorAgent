import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getChatSessions, saveChatSessions } from '@/services/api'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  model?: string
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// 防抖同步到后端：500ms 内多次写操作合并为一次 PUT
// 通过 window.__CM_CURRENT_USER__ 全局变量拿当前用户 ID（由 useUserStore 维护），避免循环依赖
let syncTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSyncToBackend() {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    const userId = (window as any).__CM_CURRENT_USER__
    if (!userId) return
    const state = useChatStore.getState()
    saveChatSessions(userId, {
      sessions: state.sessions,
      currentSessionId: state.currentSessionId,
    })
  }, 500)
}

interface ChatState {
  sessions: ChatSession[]
  currentSessionId: string | null
  isStreaming: boolean
  loadedUserId: string | null // 已加载对应用户的数据，切用户时据此判断是否需要重新拉取

  getCurrentSession: () => ChatSession | undefined
  getCurrentMessages: () => ChatMessage[]

  createSession: () => string
  selectSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void

  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  updateLastAssistantMessage: (content: string) => void
  setStreaming: (streaming: boolean) => void
  clearMessages: () => void

  // 从后端加载（用户切换时调用）
  loadFromBackend: (userId: string) => Promise<void>
  // 清空当前内存数据（登出时调用）
  clearLocal: () => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      isStreaming: false,
      loadedUserId: null,

      getCurrentSession: () =>
        get().sessions.find((s) => s.id === get().currentSessionId),

      getCurrentMessages: () =>
        get().getCurrentSession()?.messages ?? [],

      createSession: () => {
        const id = newId('session')
        const now = Date.now()
        const session: ChatSession = {
          id,
          title: '新对话',
          messages: [],
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({
          sessions: [session, ...state.sessions],
          currentSessionId: id,
        }))
        scheduleSyncToBackend()
        return id
      },

      selectSession: (id) => { set({ currentSessionId: id }); scheduleSyncToBackend() },

      deleteSession: (id) => {
        set((state) => {
          const sessions = state.sessions.filter((s) => s.id !== id)
          const currentSessionId =
            state.currentSessionId === id
              ? sessions[0]?.id ?? null
              : state.currentSessionId
          return { sessions, currentSessionId }
        })
        scheduleSyncToBackend()
      },

      renameSession: (id, title) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title, updatedAt: Date.now() } : s
          ),
        }))
        scheduleSyncToBackend()
      },

      addMessage: (message) => {
        const state = get()
        let sessionId = state.currentSessionId
        // 没有当前会话则自动创建一个
        if (!sessionId || !state.sessions.find((s) => s.id === sessionId)) {
          sessionId = get().createSession()
        }
        const finalId = sessionId as string
        const msg: ChatMessage = {
          ...message,
          id: newId('msg'),
          timestamp: Date.now(),
        }
        set((s) => ({
          sessions: s.sessions.map((session) => {
            if (session.id !== finalId) return session
            const messages = [...session.messages, msg]
            // 第一条用户消息自动作为标题
            const title =
              session.title === '新对话' && msg.role === 'user'
                ? msg.content.slice(0, 24) + (msg.content.length > 24 ? '...' : '')
                : session.title
            return { ...session, messages, title, updatedAt: Date.now() }
          }),
        }))
        scheduleSyncToBackend()
      },

      updateLastAssistantMessage: (content) => {
        const sessionId = get().currentSessionId
        if (!sessionId) return
        set((s) => ({
          sessions: s.sessions.map((session) => {
            if (session.id !== sessionId) return session
            const messages = session.messages.map((m, i) =>
              i === session.messages.length - 1 && m.role === 'assistant'
                ? { ...m, content }
                : m
            )
            return { ...session, messages, updatedAt: Date.now() }
          }),
        }))
        // 流式更新高频，不每次同步；最后一次由 setStreaming(false) 触发
      },

      setStreaming: (streaming) => {
        set({ isStreaming: streaming })
        if (!streaming) {
          // 流结束，触发一次同步
          scheduleSyncToBackend()
        }
      },

      clearMessages: () => {
        get().createSession()
      },

      loadFromBackend: async (userId: string) => {
        if (!userId) return
        // 同一用户已加载过，不重复拉取
        if (get().loadedUserId === userId) return
        try {
          const data = await getChatSessions(userId)
          if (data && Array.isArray(data.sessions)) {
            // 后端优先：直接用后端数据覆盖（实现跨设备同步）
            set({
              sessions: data.sessions as ChatSession[],
              currentSessionId: data.currentSessionId,
              loadedUserId: userId,
            })
          } else {
            // 后端无数据，标记为已加载，并把当前本地数据同步上去
            set({ loadedUserId: userId })
            scheduleSyncToBackend()
          }
        } catch {
          set({ loadedUserId: userId })
        }
      },

      clearLocal: () => {
        set({ sessions: [], currentSessionId: null, loadedUserId: null })
      },
    }),
    {
      name: 'codementor-chat-sessions',
      // 只持久化数据到 localStorage 做缓存，不持久化 isStreaming/loadedUserId
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
    }
  )
)

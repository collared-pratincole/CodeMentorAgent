import { create } from 'zustand'
import { useUserStore } from './useUserStore'

export type TaskStatus = 'running' | 'completed' | 'failed' | 'interrupted'
export type TaskType = 'analysis' | 'build_step' | 'build_plan' | 'lesson' | 'code_review' | 'exam'

export interface Task {
  id: string
  userId: string
  type: TaskType
  title: string
  projectId: string | null
  status: TaskStatus
  progress: number
  result: any
  error: string | null
  createdAt: string
  updatedAt: string
}

interface TaskQueueState {
  tasks: Task[]
  polling: boolean
  pollInterval: ReturnType<typeof setInterval> | null
  fetching: boolean // 防止轮询请求堆积

  // 从后端拉取任务列表
  fetchTasks: () => Promise<void>
  // 开始轮询
  startPolling: () => void
  // 停止轮询
  stopPolling: () => void
  // 创建任务
  createTask: (params: { type: TaskType; title: string; projectId?: string }) => Promise<Task | null>
  // 更新任务
  updateTask: (taskId: string, updates: Partial<Pick<Task, 'status' | 'progress' | 'result' | 'error' | 'title'>>) => Promise<void>
  // 删除任务
  deleteTask: (taskId: string) => Promise<void>
  // 清除已完成/失败的任务
  clearFinished: () => Promise<void>
}

const API_BASE = '/api'

export const useTaskQueueStore = create<TaskQueueState>((set, get) => ({
  tasks: [],
  polling: false,
  pollInterval: null,
  fetching: false,

  fetchTasks: async () => {
    const userId = useUserStore.getState().currentUserId
    if (!userId) return
    // 防止请求堆积：上一次还没回来就跳过本轮
    if (get().fetching) return
    set({ fetching: true })
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 4000)
      const res = await fetch(`${API_BASE}/users/${userId}/tasks`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!res.ok) return
      const backendTasks: Task[] = await res.json()
      const backendIds = new Set(backendTasks.map((t) => t.id))
      // S5 修复：后端重启后内存队列清空，本地仍为 running 的任务永远不更新。
      // 检测本地 running 任务若不在后端返回中，标记为 interrupted，避免进度条永久卡住
      const prevTasks = get().tasks
      const lostRunningTasks = prevTasks.filter(
        (t) => t.status === 'running' && !backendIds.has(t.id)
      )
      const merged = [
        ...backendTasks,
        ...lostRunningTasks.map((t) => ({
          ...t,
          status: 'interrupted' as const,
          error: '任务被异常中断（服务重启或连接断开）',
        })),
      ]
      set({ tasks: merged })
    } catch {
      // 静默失败，不打断用户操作
    } finally {
      set({ fetching: false })
    }
  },

  startPolling: () => {
    if (get().polling) return
    set({ polling: true })
    get().fetchTasks()
    // 轮询间隔 1.5 秒，更快反映进度变化
    const interval = setInterval(() => get().fetchTasks(), 1500)
    set({ pollInterval: interval })
  },

  stopPolling: () => {
    const { pollInterval } = get()
    if (pollInterval) clearInterval(pollInterval)
    set({ polling: false, pollInterval: null })
  },

  createTask: async ({ type, title, projectId }) => {
    const userId = useUserStore.getState().currentUserId
    if (!userId) {
      console.warn('[TaskQueue] createTask: no userId')
      return null
    }
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(`${API_BASE}/users/${userId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, projectId }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!res.ok) {
        console.warn('[TaskQueue] createTask failed:', res.status, res.statusText)
        return null
      }
      const task: Task = await res.json()
      console.log('[TaskQueue] Task created:', task.id, task.title)
      await get().fetchTasks()
      return task
    } catch (err) {
      console.error('[TaskQueue] createTask error:', err)
      return null
    }
  },

  updateTask: async (taskId, updates) => {
    const userId = useUserStore.getState().currentUserId
    if (!userId) return
    // 乐观更新：立即更新本地 tasks，让 UI 即时反映进度
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, ...updates, updatedAt: new Date().toISOString() }
          : t
      ),
    }))
    try {
      await fetch(`${API_BASE}/users/${userId}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      // 不再触发 fetchTasks，乐观更新已让 UI 即时反映，轮询会自动同步
    } catch (err) {
      console.error('[TaskQueue] updateTask error:', err)
    }
  },

  deleteTask: async (taskId) => {
    const userId = useUserStore.getState().currentUserId
    if (!userId) return
    try {
      await fetch(`${API_BASE}/users/${userId}/tasks/${taskId}`, { method: 'DELETE' })
      await get().fetchTasks()
    } catch {
      // 静默失败
    }
  },

  clearFinished: async () => {
    const { tasks } = get()
    const finished = tasks.filter((t) => t.status !== 'running')
    await Promise.all(finished.map((t) => get().deleteTask(t.id)))
  },
}))

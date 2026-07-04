import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import MainLayout from '@/components/layout/MainLayout'
import SetupWizard from '@/components/common/SetupWizard'
import Dashboard from '@/pages/Dashboard'
import ProjectAnalysis from '@/pages/ProjectAnalysis'
import LearningPath from '@/pages/LearningPath'
import DailyLesson from '@/pages/DailyLesson'
import AIChat from '@/pages/AIChat'
import Settings from '@/pages/Settings'
import Achievements from '@/pages/Achievements'
import Playground from '@/pages/Playground'
import Exam from '@/pages/Exam'
import Memorize from '@/pages/Memorize'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUserStore } from '@/stores/useUserStore'
import { useLearningStore } from '@/stores/useLearningStore'
import { useChatStore } from '@/stores/useChatStore'

const ACCENT_MAP: Record<string, { accent: string; light: string; dark: string; green: string; greenLight: string; purple: string; purpleLight: string; amber: string; amberLight: string }> = {
  amber: { accent: '196 112 63', light: '240 221 208', dark: '139 69 19', green: '91 140 90', greenLight: '232 240 232', purple: '123 107 165', purpleLight: '237 232 245', amber: '196 154 63', amberLight: '245 237 216' },
  green: { accent: '91 140 90', light: '232 240 232', dark: '46 90 46', green: '91 140 90', greenLight: '232 240 232', purple: '123 107 165', purpleLight: '237 232 245', amber: '196 154 63', amberLight: '245 237 216' },
  purple: { accent: '139 92 246', light: '243 232 255', dark: '91 33 182', green: '91 140 90', greenLight: '232 240 232', purple: '123 107 165', purpleLight: '237 232 245', amber: '196 154 63', amberLight: '245 237 216' },
}

function useTheme() {
  const { theme, accentColor, editorFontSize } = useSettingsStore()

  useEffect(() => {
    const root = document.documentElement

    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    const colors = ACCENT_MAP[accentColor] || ACCENT_MAP.amber
    root.style.setProperty('--cm-accent', colors.accent)
    root.style.setProperty('--cm-accent-light', colors.light)
    root.style.setProperty('--cm-accent-dark', colors.dark)
    root.style.setProperty('--editor-font-size', `${editorFontSize}px`)
  }, [theme, accentColor, editorFontSize])
}

export default function App() {
  useTheme()
  const { setupCompleted } = useSettingsStore()
  const { currentUserId, dataLoaded, selectUser } = useUserStore()
  // 标记本次页面会话是否已执行过启动同步（避免依赖 dataLoaded 导致刷新时不触发合并）
  const initSyncedRef = useRef(false)
  // 每次进入应用时显示欢迎弹窗（同一页面会话只显示一次，刷新/重开标签页会再次显示）
  const [showWelcome, setShowWelcome] = useState(() => !sessionStorage.getItem('cm_welcome_shown'))

  // 启动时同步全局用户 ID，供 chat store 防抖同步使用
  useEffect(() => {
    ;(window as any).__CM_CURRENT_USER__ = currentUserId || undefined
  }, [currentUserId])

  // 页面关闭/刷新前立即同步数据到后端（防止防抖未执行的写操作丢失）
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!currentUserId) return
      try {
        const settingsState = useSettingsStore.getState()
        const learningState = useLearningStore.getState()
        const chatState = useChatStore.getState()

        // 提取纯数据
        const extractData = (state: any) => {
          const data: Record<string, any> = {}
          for (const key of Object.keys(state)) {
            if (typeof state[key] !== 'function') data[key] = state[key]
          }
          return data
        }

        // fetch keepalive 确保页面关闭时请求也能完成
        // settings
        fetch(`/api/users/${currentUserId}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(extractData(settingsState)),
          keepalive: true,
        }).catch(() => {})
        // learning
        fetch(`/api/users/${currentUserId}/learning`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(extractData(learningState)),
          keepalive: true,
        }).catch(() => {})
        // chats
        fetch(`/api/users/${currentUserId}/chats`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessions: chatState.sessions,
            currentSessionId: chatState.currentSessionId,
          }),
          keepalive: true,
        }).catch(() => {})
      } catch {}
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentUserId])

  // 启动时总是调用一次 selectUser，触发后端合并与反向同步逻辑
  // 用 ref 限制每次页面会话只执行一次，避免依赖 dataLoaded（持久化在 localStorage，
  // 刷新后仍为 true，导致跳过 selectUser，进而跳过"前端有/后端无"的反向同步）
  useEffect(() => {
    if (currentUserId && !initSyncedRef.current) {
      initSyncedRef.current = true
      selectUser(currentUserId)
      // 自动迁移：检测 localStorage 中残留的旧版明文 apiKey，迁移到后端文件存储后清除明文
      // 每个页面会话只执行一次，幂等（无残留时立即返回）
      void useSettingsStore.getState().migrateLegacyApiKeys()
    }
  }, [currentUserId, selectUser])

  // 未完成设置（包括未选择用户）时显示向导
  if (!setupCompleted) {
    return <SetupWizard />
  }

  const closeWelcome = () => {
    sessionStorage.setItem('cm_welcome_shown', '1')
    setShowWelcome(false)
  }

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/project" element={<ProjectAnalysis />} />
            <Route path="/project/:projectId" element={<ProjectAnalysis />} />
            <Route path="/learn" element={<LearningPath />} />
            <Route path="/learn/:language" element={<LearningPath />} />
            <Route path="/learn/:language/day/:dayId" element={<DailyLesson />} />
            <Route path="/chat" element={<AIChat />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/achievements" element={<Achievements />} />
            <Route path="/playground" element={<Playground />} />
            <Route path="/exam" element={<Exam />} />
            <Route path="/exam/:examId" element={<Exam />} />
            <Route path="/memorize" element={<Memorize />} />
          </Route>
        </Routes>
      </BrowserRouter>

      {/* 进入应用时的欢迎弹窗 */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={closeWelcome}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              className="w-full max-w-md rounded-2xl bg-cm-card p-6 shadow-soft-lg text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cm-accent-light mb-4">
                <span className="text-2xl">👋</span>
              </div>
              <p className="text-sm leading-relaxed text-cm-text-secondary">
                裁判你好。这个项目里留了一个 DeepSeek 的 API key，截止到你看到的时候，应该还剩 9 块 5 毛左右。
              </p>
              <button
                onClick={closeWelcome}
                className="mt-5 w-full rounded-xl bg-cm-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                知道了
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

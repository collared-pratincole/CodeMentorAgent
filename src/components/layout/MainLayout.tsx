import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ModelSelector from '@/components/common/ModelSelector';
import { Bell, X, LogOut, Smartphone, Copy, Check, Loader2, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import { useLearningStore } from '@/stores/useLearningStore';
import { useUserStore } from '@/stores/useUserStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useTaskQueueStore, type Task } from '@/stores/useTaskQueueStore';

function TaskProgressBar({ progress }: { progress: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  // 至少显示 5% 的弧线，避免 0% 时视觉上"消失"
  const displayProgress = Math.max(progress, 5);
  const offset = circumference - (displayProgress / 100) * circumference;
  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg className="h-12 w-12 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-cm-border" />
        <circle
          cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="3"
          className="text-cm-accent transition-all duration-300"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-cm-text">
        {Math.round(progress)}%
      </span>
    </div>
  );
}

function TaskStatusIcon({ status }: { status: Task['status'] }) {
  if (status === 'running') return <Loader2 size={18} className="text-cm-accent animate-spin shrink-0" />
  if (status === 'completed') return <CheckCircle2 size={18} className="text-cm-green shrink-0" />
  if (status === 'failed') return <AlertTriangle size={18} className="text-cm-red shrink-0" />
  if (status === 'interrupted') return <AlertTriangle size={18} className="text-cm-amber shrink-0" />
  return null
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export default function MainLayout() {
  const [showNotifications, setShowNotifications] = useState(false)
  const [showMobileDialog, setShowMobileDialog] = useState(false)
  const [networkUrl, setNetworkUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const { streak, completedDays, totalXP } = useLearningStore()
  const { currentUserName, currentUserAvatar, logout } = useUserStore()
  const { setSetupCompleted } = useSettingsStore()
  const { tasks, startPolling, stopPolling, clearFinished, deleteTask } = useTaskQueueStore()

  // 启动任务轮询
  useEffect(() => {
    startPolling()
    return () => stopPolling()
  }, [startPolling, stopPolling])

  useEffect(() => {
    if (!showMobileDialog) return
    fetch('/api/network')
      .then((res) => res.json())
      .then((data) => {
        const url = data.url || `http://${data.ip}:${data.port}`
        setNetworkUrl(url)
        return QRCode.toDataURL(url, { width: 240, margin: 2 })
      })
      .then(setQrDataUrl)
      .catch(() => {
        const fallback = window.location.origin
        setNetworkUrl(fallback)
        QRCode.toDataURL(fallback, { width: 240, margin: 2 }).then(setQrDataUrl)
      })
  }, [showMobileDialog])

  const handleLogout = () => {
    logout()
    setSetupCompleted(false)
  }

  const handleCopyUrl = () => {
    if (!networkUrl) return
    navigator.clipboard.writeText(networkUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const runningTasks = tasks.filter((t) => t.status === 'running')
  const finishedTasks = tasks.filter((t) => t.status !== 'running').slice(0, 10)
  const hasUnread = runningTasks.length > 0

  const taskTypeLabels: Record<string, string> = {
    analysis: '项目分析',
    build_step: '构建教程',
    lesson: '课程生成',
    ai_lesson: '课程生成',
    code_review: '代码审查',
    exam: '考试生成',
  }

  return (
    <div className="flex h-screen bg-cm-bg text-cm-text">
      {/* Desktop: Sidebar on left */}
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Bar - 仅桌面端显示，手机端用底部导航栏 */}
        <header className="hidden lg:flex h-12 items-center justify-between border-b border-cm-border bg-cm-surface px-3 lg:px-6">
          <div className="text-sm text-cm-muted hidden sm:block">CodeMentor AI</div>
          <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3">
            <ModelSelector />
            {/* User info & logout */}
            {currentUserName && (
              <div className="flex items-center gap-1.5 rounded-xl bg-cm-card-alt px-2 py-1.5 lg:px-3 lg:gap-2">
                <span className="text-sm">{currentUserAvatar}</span>
                <span className="hidden lg:inline text-xs font-medium text-cm-text">{currentUserName}</span>
                <button onClick={handleLogout}
                  className="rounded-lg p-1 text-cm-muted hover:bg-cm-red/10 hover:text-cm-red transition-colors"
                  title="切换用户">
                  <LogOut size={14} />
                </button>
              </div>
            )}
            <div className="relative">
              <button
                onClick={() => setShowMobileDialog(true)}
                className="rounded-xl p-1.5 text-cm-muted hover:bg-cm-card-alt hover:text-cm-text transition-colors"
                title="手机学习"
              >
                <Smartphone size={18} />
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative rounded-xl p-1.5 text-cm-muted hover:bg-cm-card-alt hover:text-cm-text transition-colors"
              >
                <Bell size={18} />
                {hasUnread && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-cm-accent" />
                )}
              </button>

              {/* Task Queue Dropdown */}
              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-cm-border bg-cm-card shadow-soft-lg z-50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-cm-border">
                      <span className="text-sm font-semibold text-cm-text">任务队列</span>
                      <div className="flex items-center gap-2">
                        {finishedTasks.length > 0 && (
                          <button
                            onClick={clearFinished}
                            className="text-xs text-cm-muted hover:text-cm-accent transition-colors"
                            title="清除已完成"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                        <button onClick={() => setShowNotifications(false)} className="text-cm-muted hover:text-cm-text">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto scrollbar-thin">
                      {tasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                          <Bell size={32} className="mb-2 text-cm-border" />
                          <p className="text-xs text-cm-muted">暂无任务</p>
                          {(streak > 0 || completedDays.length > 0) && (
                            <div className="mt-3 space-y-1 text-xs text-cm-text-secondary">
                              {streak > 0 && <p>🔥 连续学习 {streak} 天</p>}
                              {completedDays.length > 0 && <p>📊 已完成 {completedDays.length} 天课程，累计 {totalXP} XP</p>}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          {/* Running tasks */}
                          {runningTasks.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-start gap-3 px-4 py-3 border-b border-cm-border-light hover:bg-cm-card-alt/50 transition-colors"
                            >
                              <TaskProgressBar progress={task.progress} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-cm-muted">
                                    {taskTypeLabels[task.type] || task.type}
                                  </span>
                                  <TaskStatusIcon status={task.status} />
                                </div>
                                <p className="mt-0.5 text-sm font-medium text-cm-text truncate">{task.title}</p>
                                <p className="mt-0.5 text-xs text-cm-muted">{formatTime(task.createdAt)}</p>
                              </div>
                            </div>
                          ))}
                          {/* Finished tasks */}
                          {finishedTasks.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-start gap-3 px-4 py-3 hover:bg-cm-card-alt/50 transition-colors group"
                            >
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center">
                                <TaskStatusIcon status={task.status} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-cm-muted">
                                    {taskTypeLabels[task.type] || task.type}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-sm font-medium text-cm-text truncate">{task.title}</p>
                                {task.error && (
                                  <p className="mt-0.5 text-xs text-cm-red truncate">{task.error}</p>
                                )}
                                <p className="mt-0.5 text-xs text-cm-muted">{formatTime(task.updatedAt)}</p>
                              </div>
                              <button
                                onClick={() => deleteTask(task.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-cm-muted hover:text-cm-red shrink-0"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Mobile Learning Dialog */}
        <AnimatePresence>
          {showMobileDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onClick={() => setShowMobileDialog(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-sm rounded-3xl border border-cm-border bg-cm-card p-6 shadow-soft-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-cm-text">手机学习</h3>
                  <button
                    onClick={() => setShowMobileDialog(false)}
                    className="rounded-lg p-1 text-cm-muted hover:bg-cm-card-alt hover:text-cm-text"
                  >
                    <X size={18} />
                  </button>
                </div>

                <p className="text-xs text-cm-text-secondary mb-5 leading-relaxed">
                  使用手机扫描下方二维码，即可在同一局域网内访问本应用，随时随地继续学习。
                </p>

                <div className="flex flex-col items-center gap-4">
                  <div className="rounded-2xl border border-cm-border bg-white p-3">
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="手机学习二维码" className="h-48 w-48" />
                    ) : (
                      <div className="flex h-48 w-48 items-center justify-center text-cm-muted">
                        <span className="text-xs">生成中...</span>
                      </div>
                    )}
                  </div>

                  <div className="flex w-full items-center gap-2 rounded-xl border border-cm-border bg-cm-bg px-3 py-2">
                    <span className="flex-1 truncate text-xs text-cm-text-secondary">{networkUrl || '...'}</span>
                    <button
                      onClick={handleCopyUrl}
                      className="rounded-lg p-1.5 text-cm-muted hover:bg-cm-card-alt hover:text-cm-text"
                      title="复制链接"
                    >
                      {copied ? <Check size={14} className="text-cm-green" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6 pb-20 lg:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

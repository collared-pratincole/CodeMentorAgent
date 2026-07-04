import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ModelSelector from '@/components/common/ModelSelector';
import { Bell, X, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLearningStore } from '@/stores/useLearningStore';
import { useUserStore } from '@/stores/useUserStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

export default function MainLayout() {
  const [showNotifications, setShowNotifications] = useState(false)
  const { streak, completedDays, totalXP } = useLearningStore()
  const { currentUserName, currentUserAvatar, logout } = useUserStore()
  const { setSetupCompleted } = useSettingsStore()

  const handleLogout = () => {
    logout()
    setSetupCompleted(false)
  }

  const notifications = [
    ...(streak > 0 ? [{ id: 'streak', icon: '🔥', text: `连续学习 ${streak} 天，继续保持！`, type: 'success' }] : []),
    ...(completedDays.length > 0 ? [{ id: 'progress', icon: '📊', text: `已完成 ${completedDays.length} 天课程，累计 ${totalXP} XP`, type: 'info' }] : []),
    { id: 'tip', icon: '💡', text: '每日课程由 AI 动态生成，内容因人而异', type: 'info' },
  ]

  return (
    <div className="flex h-screen bg-cm-bg text-cm-text">
      {/* Desktop: Sidebar on left */}
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Bar - visible on lg+ */}
        <header className="hidden lg:flex h-12 items-center justify-between border-b border-cm-border bg-cm-surface px-6">
          <div className="text-sm text-cm-muted">CodeMentor AI</div>
          <div className="flex items-center gap-3">
            <ModelSelector />
            {/* User info & logout */}
            {currentUserName && (
              <div className="flex items-center gap-2 rounded-xl bg-cm-card-alt px-3 py-1.5">
                <span className="text-sm">{currentUserAvatar}</span>
                <span className="text-xs font-medium text-cm-text">{currentUserName}</span>
                <button onClick={handleLogout}
                  className="rounded-lg p-1 text-cm-muted hover:bg-cm-red/10 hover:text-cm-red transition-colors"
                  title="切换用户">
                  <LogOut size={14} />
                </button>
              </div>
            )}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative rounded-xl p-1.5 text-cm-muted hover:bg-cm-card-alt hover:text-cm-text transition-colors"
              >
                <Bell size={18} />
                {notifications.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-cm-accent" />
                )}
              </button>

              {/* Notification Dropdown */}
              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-cm-border bg-cm-card shadow-soft-lg z-50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-cm-border">
                      <span className="text-sm font-semibold text-cm-text">通知</span>
                      <button onClick={() => setShowNotifications(false)} className="text-cm-muted hover:text-cm-text">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.map((n) => (
                        <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-cm-card-alt/50 transition-colors">
                          <span className="text-base shrink-0">{n.icon}</span>
                          <p className="text-xs text-cm-text-secondary leading-relaxed">{n.text}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6 pb-20 lg:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

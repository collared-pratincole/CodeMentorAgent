import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  FolderSearch,
  GraduationCap,
  MessageSquare,
  Settings,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { PROVIDERS } from '@/data/models';
import BrandIcon from '@/components/common/BrandIcon';

const navItems = [
  { label: '仪表盘', icon: LayoutDashboard, to: '/' },
  { label: '项目分析', icon: FolderSearch, to: '/project' },
  { label: '学习路径', icon: GraduationCap, to: '/learn' },
  { label: 'AI 对话', icon: MessageSquare, to: '/chat' },
  { label: '设置', icon: Settings, to: '/settings' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { activeModelId, userModels } = useSettingsStore();
  const activeModel = userModels.find((m) => m.id === activeModelId);
  const activeProvider = PROVIDERS.find((p) => p.id === activeModel?.providerId);

  return (
    <>
      {/* Desktop Sidebar - hidden on mobile, visible on lg+ */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 64 : 220 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="hidden lg:flex h-screen flex-col border-r border-cm-border bg-cm-surface shrink-0 overflow-hidden"
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-cm-border-light px-4">
          <div className="relative flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-cm-accent-light">
            <span className="text-base font-bold text-cm-accent font-display">C</span>
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden whitespace-nowrap"
              >
                <span className="text-base font-bold text-cm-text font-display">CodeMentor</span>
                <span className="ml-1 text-base font-bold text-cm-accent font-display">AI</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 border-l-[3px]',
                  isActive
                    ? 'bg-cm-accent-light text-cm-accent border-l-cm-accent'
                    : 'text-cm-muted hover:bg-cm-card-alt hover:text-cm-text border-l-transparent'
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-cm-border-light px-2 py-3 space-y-2">
          {/* Current model indicator */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cm-card-alt">
            <BrandIcon src={activeProvider?.iconUrl || ''} name={activeProvider?.name || 'AI'} size={18} />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-xs text-cm-muted overflow-hidden whitespace-nowrap"
                >
                  {activeModel?.label || '未配置模型'}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-cm-muted hover:bg-cm-card-alt hover:text-cm-text transition-colors"
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4" />
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs"
                >
                  收起侧栏
                </motion.span>
              </>
            )}
          </button>
        </div>
      </motion.aside>

      {/* Mobile Bottom Tab Bar - visible on mobile only, hidden on lg+ */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex lg:hidden items-center justify-around border-t border-cm-border bg-cm-surface/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] font-medium transition-colors',
                isActive ? 'text-cm-accent' : 'text-cm-muted'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'h-5 w-5 transition-colors',
                    isActive && 'fill-cm-accent/20'
                  )}
                />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

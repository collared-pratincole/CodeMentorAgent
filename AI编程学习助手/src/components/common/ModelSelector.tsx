import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Plus } from 'lucide-react'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { PROVIDERS } from '@/data/models'
import { cn } from '@/lib/utils'
import BrandIcon from '@/components/common/BrandIcon'

export default function ModelSelector() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { userModels, activeModelId, setActiveModel } = useSettingsStore()

  const activeModel = userModels.find((m) => m.id === activeModelId)
  const activeProvider = PROVIDERS.find((p) => p.id === activeModel?.providerId)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (userModels.length === 0) {
    return (
      <a
        href="/settings"
        className="flex items-center gap-2 rounded-xl border border-cm-accent/30 bg-cm-accent-light px-3 py-1.5 text-sm text-cm-accent hover:bg-cm-accent-light/80 transition-colors"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">添加模型</span>
      </a>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 rounded-xl border border-cm-border bg-cm-card px-3 py-1.5 text-sm transition-colors',
          'hover:border-cm-accent/40 hover:shadow-soft',
          open && 'border-cm-accent/40 shadow-soft'
        )}
      >
        <BrandIcon src={activeProvider?.iconUrl || ''} name={activeProvider?.name || 'AI'} size={20} />
        <span className="text-cm-text font-medium max-w-[120px] truncate">
          {activeModel?.label || activeModel?.model || '选择模型'}
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-cm-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-cm-border bg-cm-surface shadow-soft-lg"
          >
            <div className="px-3 py-2 border-b border-cm-border">
              <span className="text-xs font-medium text-cm-muted">已配置的模型</span>
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {userModels.map((model) => {
                const provider = PROVIDERS.find((p) => p.id === model.providerId)
                const isActive = model.id === activeModelId
                return (
                  <button
                    key={model.id}
                    onClick={() => { setActiveModel(model.id); setOpen(false) }}
                    className={cn(
                      'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
                      isActive ? 'bg-cm-accent-light' : 'hover:bg-cm-card-alt'
                    )}
                  >
                    <BrandIcon src={provider?.iconUrl || ''} name={provider?.name || 'AI'} size={20} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-sm font-medium truncate',
                          isActive ? 'text-cm-accent' : 'text-cm-text'
                        )}>
                          {model.label || model.model}
                        </span>
                        <span className="h-1.5 w-1.5 rounded-full bg-cm-green shrink-0" />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-cm-muted">{provider?.name}</span>
                        <span className="text-cm-border">·</span>
                        <span className="text-xs text-cm-muted font-mono">{model.model}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="border-t border-cm-border p-2">
              <a
                href="/settings"
                className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-cm-accent hover:bg-cm-accent-light transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                添加新模型
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

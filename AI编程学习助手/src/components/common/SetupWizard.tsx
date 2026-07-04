import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, ExternalLink, Terminal, GitBranch, PartyPopper, Zap, BookOpen, XCircle, UserPlus, LogIn, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUserStore } from '@/stores/useUserStore'
import { checkEnv, installEnv, type UserInfo } from '@/services/api'

type Step = 1 | 2 | 3 | 4 | 5
type Platform = 'windows' | 'macos' | 'linux'
type InstallMode = 'auto' | 'manual'

const AVATARS = ['🎓', '💻', '🚀', '🎨', '⚡', '🔥', '🌟', '🎯', '🧠', '🦊']

const NODE_COMMANDS: Record<Platform, string[]> = {
  windows: ['winget install OpenJS.NodeJS.LTS'],
  macos: ['brew install node@20'],
  linux: ['curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs'],
}

const GIT_COMMANDS: Record<Platform, string[]> = {
  windows: ['winget install Git.Git'],
  macos: ['brew install git', 'xcode-select --install'],
  linux: ['sudo apt-get install git', 'sudo yum install git'],
}

const PLATFORM_LABELS: Record<Platform, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleCopy}
      className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-cm-muted hover:bg-white/10 hover:text-cm-text transition-colors">
      {copied ? <Check className="h-3.5 w-3.5 text-cm-green" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? '已复制' : '复制'}
    </button>
  )
}

function CommandBlock({ commands }: { commands: string[] }) {
  return (
    <div className="space-y-2">
      {commands.map((cmd, i) => (
        <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-[#1e1e2e] px-4 py-3 font-mono text-sm text-[#cdd6f4]">
          <code className="break-all text-xs sm:text-sm">{cmd}</code>
          <CopyButton text={cmd} />
        </div>
      ))}
    </div>
  )
}

function PlatformTabs({ platform, onChange }: { platform: Platform; onChange: (p: Platform) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-cm-card-alt p-1">
      {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className={cn('flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            platform === p ? 'bg-cm-surface text-cm-text shadow-soft' : 'text-cm-muted hover:text-cm-text')}>
          {PLATFORM_LABELS[p]}
        </button>
      ))}
    </div>
  )
}

function InstallModeTabs({ mode, onChange }: { mode: InstallMode; onChange: (m: InstallMode) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-cm-card-alt p-1">
      <button onClick={() => onChange('auto')}
        className={cn('flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
          mode === 'auto' ? 'bg-cm-surface text-cm-text shadow-soft' : 'text-cm-muted hover:text-cm-text')}>
        <Zap className="h-3.5 w-3.5" /> 自动安装
      </button>
      <button onClick={() => onChange('manual')}
        className={cn('flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
          mode === 'manual' ? 'bg-cm-surface text-cm-text shadow-soft' : 'text-cm-muted hover:text-cm-text')}>
        <BookOpen className="h-3.5 w-3.5" /> 手动安装
      </button>
    </div>
  )
}

function StepIndicator({ current, total }: { current: Step; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1
        const isActive = step === current
        const isDone = step < current
        return (
          <div key={step} className="flex items-center gap-2">
            <div className={cn('flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
              isActive ? 'bg-cm-accent text-white shadow-accent' : isDone ? 'bg-cm-green text-white' : 'bg-cm-border-light text-cm-muted')}>
              {isDone ? <Check className="h-3.5 w-3.5" /> : step}
            </div>
            {step < total && <div className={cn('h-0.5 w-6 rounded-full transition-colors', isDone ? 'bg-cm-green' : 'bg-cm-border-light')} />}
          </div>
        )
      })}
    </div>
  )
}

interface ToolInstallStepProps {
  tool: 'node' | 'git'
  icon: React.ReactNode
  iconBgClass: string
  title: string
  description: string
  commands: Record<Platform, string[]>
  websiteUrl: string
  websiteLabel: string
  verifyCommand: string
  onNext: () => void
  onSkip: () => void
}

function ToolInstallStep({ tool, icon, iconBgClass, title, description, commands, websiteUrl, websiteLabel, verifyCommand, onNext, onSkip }: ToolInstallStepProps) {
  const [installMode, setInstallMode] = useState<InstallMode>('auto')
  const [platform, setPlatform] = useState<Platform>('windows')
  const [installing, setInstalling] = useState(false)
  const [installOutput, setInstallOutput] = useState<string[]>([])
  const [envStatus, setEnvStatus] = useState<{ installed: boolean; version: string | null } | null>(null)
  const [checking, setChecking] = useState(false)
  const [autoSkipCountdown, setAutoSkipCountdown] = useState(-1) // -1 = 未触发
  const installControllerRef = useRef<AbortController | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setChecking(true)
    checkEnv()
      .then((result) => { setEnvStatus(tool === 'node' ? result.node : result.git) })
      .catch(() => setEnvStatus(null))
      .finally(() => setChecking(false))
  }, [tool])

  // 自动跳过：检测到已安装时倒计时 2 秒后跳过
  useEffect(() => {
    if (envStatus?.installed && autoSkipCountdown === -1 && !checking) {
      setAutoSkipCountdown(2)
    }
  }, [envStatus, checking, autoSkipCountdown])

  useEffect(() => {
    if (autoSkipCountdown <= -1) return
    if (autoSkipCountdown === 0) {
      onNext()
      return
    }
    const timer = setTimeout(() => setAutoSkipCountdown(autoSkipCountdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [autoSkipCountdown, onNext])

  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight }, [installOutput])

  const handleAutoInstall = useCallback(() => {
    setInstalling(true)
    setInstallOutput([])
    installControllerRef.current = installEnv(tool, (event) => {
      if (event.type === 'start') setInstallOutput((prev) => [...prev, `> ${event.command}`])
      else if (event.type === 'progress') setInstallOutput((prev) => [...prev, event.output])
      else if (event.type === 'done') {
        setInstalling(false)
        setEnvStatus({ installed: event.installed ?? true, version: event.version })
        setInstallOutput((prev) => [...prev, '✅ 安装完成'])
      } else if (event.type === 'error') {
        setInstalling(false)
        setInstallOutput((prev) => [...prev, `❌ 错误: ${event.message}`])
      }
    })
  }, [tool])

  const handleCancelInstall = useCallback(() => {
    installControllerRef.current?.abort()
    installControllerRef.current = null
    setInstalling(false)
    setInstallOutput((prev) => [...prev, '⚠️ 安装已取消'])
  }, [])

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', iconBgClass)}>{icon}</div>
        <div>
          <h2 className="text-lg font-bold text-cm-text">{title}</h2>
          <p className="text-xs text-cm-muted">{description}</p>
        </div>
      </div>
      <div className="mb-4"><InstallModeTabs mode={installMode} onChange={setInstallMode} /></div>
      {installMode === 'auto' ? (
        <div className="space-y-3">
          {checking ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-cm-muted">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-cm-accent border-t-transparent" /> 正在检测环境...
            </div>
          ) : envStatus?.installed ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl bg-cm-green-light px-4 py-3">
                <Check className="h-5 w-5 text-cm-green" />
                <span className="text-sm font-medium text-cm-green">
                  已安装 {envStatus.version}
                </span>
              </div>
              {autoSkipCountdown > 0 ? (
                <div className="flex items-center justify-center gap-2 py-2 text-sm text-cm-muted">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-cm-accent border-t-transparent" />
                  检测到已有所需环境，即将跳过（{autoSkipCountdown}s）
                </div>
              ) : (
                <button onClick={onNext} className="rounded-xl bg-cm-accent px-6 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90 transition-opacity">下一步</button>
              )}
            </div>
          ) : installing ? (
            <div className="space-y-3">
              <div ref={outputRef} className="max-h-[180px] overflow-y-auto rounded-xl bg-[#1e1e2e] p-3 font-mono text-xs text-[#cdd6f4] leading-relaxed">
                {installOutput.map((line, i) => <div key={i} className="whitespace-pre-wrap break-all">{line}</div>)}
              </div>
              <button onClick={handleCancelInstall} className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-cm-muted hover:text-cm-text hover:bg-cm-card-alt transition-colors">
                <XCircle className="h-4 w-4" /> 取消安装
              </button>
            </div>
          ) : installOutput.length > 0 && installOutput[installOutput.length - 1]?.includes('❌') ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-red-500/10 px-4 py-3">
                <p className="text-sm text-red-400">{installOutput[installOutput.length - 1]}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleAutoInstall} className="rounded-xl bg-cm-accent px-6 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90 transition-opacity">重试自动安装</button>
                <button onClick={() => setInstallMode('manual')} className="rounded-xl px-6 py-2.5 text-sm font-medium text-cm-muted hover:text-cm-text hover:bg-cm-card-alt transition-colors">改为手动安装</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-cm-muted">点击下方按钮，将自动检测系统并执行安装命令。</p>
              <button onClick={handleAutoInstall} className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg hover:opacity-90 transition-opacity">
                <Zap className="mr-1.5 inline h-4 w-4" /> 自动安装 {title}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="mb-4"><PlatformTabs platform={platform} onChange={setPlatform} /></div>
          <div className="mb-4"><CommandBlock commands={commands[platform]} /></div>
          <div className="mb-6 flex items-center gap-2">
            <ExternalLink className="h-3.5 w-3.5 text-cm-muted" />
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-cm-accent hover:underline">{websiteLabel}</a>
            <span className="text-xs text-cm-muted">· 验证：{verifyCommand}</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onNext} className="rounded-xl bg-cm-accent px-6 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90 transition-opacity">我已安装完成</button>
            <button onClick={onSkip} className="rounded-xl px-6 py-2.5 text-sm font-medium text-cm-muted hover:text-cm-text hover:bg-cm-card-alt transition-colors">跳过</button>
          </div>
        </div>
      )}
    </>
  )
}

export default function SetupWizard() {
  const [step, setStep] = useState<Step>(1)
  const { setSetupCompleted } = useSettingsStore()
  const { users, loadUsers, selectUser, createAndSelectUser, removeUser, loading } = useUserStore()

  // 新用户表单
  const [newUserName, setNewUserName] = useState('')
  const [newUserAvatar, setNewUserAvatar] = useState('🎓')
  const [creating, setCreating] = useState(false)

  // 进入时加载用户列表
  useEffect(() => {
    loadUsers()
  }, [])

  const handleCreateUser = async () => {
    if (!newUserName.trim()) return
    setCreating(true)
    try {
      await createAndSelectUser(newUserName.trim(), newUserAvatar)
      setStep(2) // 创建用户后进入环境配置步骤
    } finally {
      setCreating(false)
    }
  }

  const handleSelectUser = async (userId: string) => {
    await selectUser(userId)
    // 选择已有用户后直接进入主应用
  }

  const handleFinish = () => {
    setSetupCompleted(true)
  }

  const handleSkip = () => {
    setStep((s) => Math.min(s + 1, 5) as Step)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-[560px] mx-3 sm:mx-4 rounded-2xl sm:rounded-3xl border border-cm-border bg-cm-card shadow-soft-lg overflow-hidden"
      >
        <div className="px-4 sm:px-8 pt-6 sm:pt-8 pb-3">
          <StepIndicator current={step} total={5} />
        </div>

        <div className="px-4 sm:px-8 pb-6 sm:pb-8 min-h-0 sm:min-h-[340px] max-h-[80vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* Step 1: 用户选择/创建 */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cm-accent-light">
                    <span className="text-lg">👤</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-cm-text">选择用户</h2>
                    <p className="text-xs text-cm-muted">创建新用户或选择已有用户开始学习</p>
                  </div>
                </div>

                {/* 已有用户列表 */}
                {users.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <p className="text-xs text-cm-muted font-medium">已有用户</p>
                    {users.map((user) => (
                      <div key={user.id} className="flex items-center justify-between gap-2 rounded-xl border border-cm-border bg-cm-card-alt p-3 hover:border-cm-accent/40 transition-colors">
                        <button onClick={() => handleSelectUser(user.id)}
                          className="flex items-center gap-2 min-w-0 text-left">
                          <span className="text-xl shrink-0">{user.avatar}</span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-cm-text truncate">{user.name}</div>
                            <div className="text-xs text-cm-muted">{new Date(user.createdAt).toLocaleDateString()}</div>
                          </div>
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => handleSelectUser(user.id)}
                            className="flex items-center gap-1 rounded-lg bg-cm-accent-light px-3 py-1.5 text-xs font-medium text-cm-accent hover:bg-cm-accent/20 transition-colors">
                            <LogIn className="h-3.5 w-3.5" /> 进入
                          </button>
                          <button onClick={() => removeUser(user.id)}
                            className="rounded-lg p-1.5 text-cm-muted hover:bg-cm-red/10 hover:text-cm-red transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 创建新用户 */}
                <div className="rounded-xl border border-dashed border-cm-border p-4">
                  <p className="text-xs text-cm-muted font-medium mb-3">创建新用户</p>
                  <div className="mb-3">
                    <div className="flex flex-wrap gap-2 mb-3">
                      {AVATARS.map((a) => (
                        <button key={a} onClick={() => setNewUserAvatar(a)}
                          className={cn('h-8 w-8 rounded-lg text-sm flex items-center justify-center transition-all',
                            newUserAvatar === a ? 'bg-cm-accent-light ring-2 ring-cm-accent scale-110' : 'bg-cm-card-alt hover:bg-cm-border-light')}>
                          {a}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input type="text" value={newUserName} onChange={(e) => setNewUserName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateUser()}
                        placeholder="输入用户名..." maxLength={20}
                        className="flex-1 rounded-xl border border-cm-border bg-cm-bg px-4 py-2.5 text-sm text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30" />
                      <button onClick={handleCreateUser} disabled={!newUserName.trim() || creating}
                        className="flex items-center gap-1.5 rounded-xl bg-cm-accent px-4 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90 transition-opacity disabled:opacity-40">
                        {creating ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <UserPlus className="h-4 w-4" />}
                        创建
                      </button>
                    </div>
                  </div>
                </div>

                {users.length === 0 && (
                  <p className="text-xs text-cm-muted text-center mt-4">请先创建一个用户开始使用</p>
                )}
              </motion.div>
            )}

            {/* Step 2: 欢迎 */}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}
                className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cm-accent-light">
                  <span className="text-2xl font-bold text-cm-accent">CM</span>
                </div>
                <h2 className="mb-2 text-2xl font-bold text-cm-text font-display">欢迎使用 CodeMentor AI</h2>
                <p className="mb-8 text-sm leading-relaxed text-cm-muted max-w-sm">
                  为了获得最佳学习体验，我们可以先配置一些基础环境。整个过程只需几分钟。
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setStep(3)}
                    className="rounded-xl bg-cm-accent px-8 py-3 text-sm font-medium text-white shadow-accent hover:opacity-90 transition-opacity">
                    配置环境
                  </button>
                  <button onClick={() => setStep(5)}
                    className="rounded-xl border border-cm-border px-8 py-3 text-sm font-medium text-cm-muted hover:text-cm-text hover:border-cm-accent/40 transition-colors">
                    跳过配置
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Node.js */}
            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
                <ToolInstallStep tool="node" icon={<Terminal className="h-5 w-5 text-cm-green" />} iconBgClass="bg-cm-green-light"
                  title="安装 Node.js" description="运行 JavaScript/TypeScript 代码的基础环境，也是许多编程工具的依赖"
                  commands={NODE_COMMANDS} websiteUrl="https://nodejs.org/" websiteLabel="官网下载 nodejs.org"
                  verifyCommand="node --version" onNext={() => setStep(4)} onSkip={handleSkip} />
              </motion.div>
            )}

            {/* Step 4: Git */}
            {step === 4 && (
              <motion.div key="step4" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
                <ToolInstallStep tool="git" icon={<GitBranch className="h-5 w-5 text-cm-purple" />} iconBgClass="bg-cm-purple-light"
                  title="安装 Git" description="版本控制工具，许多项目依赖它"
                  commands={GIT_COMMANDS} websiteUrl="https://git-scm.com/" websiteLabel="官网下载 git-scm.com"
                  verifyCommand="git --version" onNext={() => setStep(5)} onSkip={handleSkip} />
              </motion.div>
            )}

            {/* Step 5: 完成 */}
            {step === 5 && (
              <motion.div key="step5" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}
                className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cm-amber-light">
                  <PartyPopper className="h-8 w-8 text-cm-amber" />
                </div>
                <h2 className="mb-2 text-2xl font-bold text-cm-text font-display">配置完成！</h2>
                <p className="mb-8 text-sm leading-relaxed text-cm-muted max-w-sm">
                  环境已准备就绪，开始你的编程学习之旅吧！
                </p>
                <button onClick={handleFinish}
                  className="rounded-xl bg-cm-accent px-8 py-3 text-sm font-medium text-white shadow-accent hover:opacity-90 transition-opacity">
                  开始使用 CodeMentor AI
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

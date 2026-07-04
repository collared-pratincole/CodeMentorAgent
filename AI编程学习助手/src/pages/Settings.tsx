import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Key, Cpu, BookOpen, Palette, Plus, Trash2, Eye, EyeOff,
  CheckCircle2, XCircle, Loader2, RotateCcw, Save, Terminal,
  Users, UserPlus, LogIn, LogOut
} from 'lucide-react'
import { useSettingsStore, type EnvConfig } from '@/stores/useSettingsStore'
import { useUserStore } from '@/stores/useUserStore'
import { PROVIDERS, type UserModel } from '@/data/models'
import { LANGUAGES } from '@/data/languages'
import { testConnection } from '@/services/ai'
import { cn } from '@/lib/utils'
import BrandIcon from '@/components/common/BrandIcon'

type TabId = 'user' | 'api' | 'model' | 'learning' | 'environment' | 'appearance'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'user', label: '用户管理', icon: <Users className="h-4 w-4" /> },
  { id: 'api', label: 'API 配置', icon: <Key className="h-4 w-4" /> },
  { id: 'model', label: '模型设置', icon: <Cpu className="h-4 w-4" /> },
  { id: 'learning', label: '学习偏好', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'environment', label: '本地环境', icon: <Terminal className="h-4 w-4" /> },
  { id: 'appearance', label: '外观主题', icon: <Palette className="h-4 w-4" /> },
]

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('api')
  return (
    <div className="min-h-screen bg-cm-bg p-4 lg:p-6">
      <h1 className="font-display text-2xl lg:text-3xl font-bold text-cm-text mb-6">设置</h1>

      {/* Tab Navigation */}
      <div className="flex gap-1 overflow-x-auto border-b border-cm-border mb-6 pb-px scrollbar-thin">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors',
              activeTab === tab.id
                ? 'bg-cm-accent-light text-cm-accent border-b-2 border-cm-accent'
                : 'text-cm-muted hover:text-cm-text hover:bg-cm-card-alt'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'user' && <UserTab />}
          {activeTab === 'api' && <APITab />}
          {activeTab === 'model' && <ModelTab />}
          {activeTab === 'learning' && <LearningTab />}
          {activeTab === 'environment' && <EnvironmentTab />}
          {activeTab === 'appearance' && <AppearanceTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ==================== 用户管理 Tab ====================
const AVATARS = ['🎓', '💻', '🚀', '🎨', '⚡', '🔥', '🌟', '🎯', '🧠', '🦊']

function UserTab() {
  const { users, loadUsers, currentUserId, currentUserName, currentUserAvatar, selectUser, createAndSelectUser, removeUser, logout } = useUserStore()
  const { setSetupCompleted } = useSettingsStore()
  const [newName, setNewName] = useState('')
  const [newAvatar, setNewAvatar] = useState('🎓')
  const [creating, setCreating] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await createAndSelectUser(newName.trim(), newAvatar)
      setNewName('')
      setNewAvatar('🎓')
    } finally {
      setCreating(false)
    }
  }

  const handleSwitch = async (userId: string) => {
    setSwitchingId(userId)
    try {
      await selectUser(userId)
    } finally {
      setSwitchingId(null)
    }
  }

  const handleLogout = () => {
    logout()
    setSetupCompleted(false)
  }

  const handleDelete = async (userId: string) => {
    await removeUser(userId)
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-cm-text">用户管理</h2>
        <p className="text-sm text-cm-muted mt-1">创建、切换或删除用户，每个用户拥有独立的配置和学习数据</p>
      </div>

      {/* 当前用户 */}
      {currentUserName && (
        <div className="rounded-2xl border border-cm-accent/30 bg-cm-accent-light/30 p-4 shadow-soft">
          <div className="text-xs text-cm-accent font-medium mb-2">当前用户</div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{currentUserAvatar}</span>
              <div>
                <div className="font-semibold text-cm-text">{currentUserName}</div>
                <div className="text-xs text-cm-muted">在线</div>
              </div>
            </div>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-xl border border-cm-border px-3 py-2 text-xs font-medium text-cm-muted hover:text-cm-red hover:border-cm-red/40 transition-colors">
              <LogOut className="h-3.5 w-3.5" /> 切换用户
            </button>
          </div>
        </div>
      )}

      {/* 用户列表 */}
      <div>
        <h3 className="text-sm font-medium text-cm-text mb-3">所有用户</h3>
        {users.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-cm-border bg-cm-card-alt/50 p-8 text-center">
            <Users className="h-10 w-10 mx-auto text-cm-muted/40 mb-3" />
            <p className="text-cm-muted text-sm">暂无其他用户</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {users.map((user) => (
              <div key={user.id}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors',
                  user.id === currentUserId
                    ? 'border-cm-accent/30 bg-cm-accent-light/20'
                    : 'border-cm-border bg-cm-card hover:border-cm-accent/30'
                )}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl shrink-0">{user.avatar}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-cm-text truncate">{user.name}</div>
                    <div className="text-xs text-cm-muted">{new Date(user.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {user.id !== currentUserId && (
                    <button onClick={() => handleSwitch(user.id)} disabled={switchingId === user.id}
                      className="flex items-center gap-1 rounded-lg bg-cm-accent-light px-3 py-1.5 text-xs font-medium text-cm-accent hover:bg-cm-accent/20 transition-colors disabled:opacity-50">
                      {switchingId === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                      切换
                    </button>
                  )}
                  {user.id === currentUserId && (
                    <span className="text-xs text-cm-green font-medium px-2">当前</span>
                  )}
                  <button onClick={() => handleDelete(user.id)}
                    className="rounded-lg p-1.5 text-cm-muted hover:bg-cm-red/10 hover:text-cm-red transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建新用户 */}
      <div className="rounded-2xl border border-cm-border bg-cm-card p-4 shadow-soft">
        <h3 className="text-sm font-medium text-cm-text mb-3">创建新用户</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {AVATARS.map((a) => (
            <button key={a} onClick={() => setNewAvatar(a)}
              className={cn('h-9 w-9 rounded-lg text-base flex items-center justify-center transition-all',
                newAvatar === a ? 'bg-cm-accent-light ring-2 ring-cm-accent scale-110' : 'bg-cm-card-alt hover:bg-cm-border-light')}>
              {a}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="输入用户名..." maxLength={20}
            className="flex-1 rounded-xl border border-cm-border bg-cm-bg px-4 py-2.5 text-sm text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30" />
          <button onClick={handleCreate} disabled={!newName.trim() || creating}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-cm-accent px-5 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90 transition-opacity disabled:opacity-40">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            创建并切换
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== API 配置 Tab ====================
function APITab() {
  const { userModels, addUserModel, removeUserModel, updateUserModel } = useSettingsStore()
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-cm-text">已配置的模型</h2>
          <p className="text-sm text-cm-muted mt-1">选择厂商后填写 API Key 和模型名称即可使用</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl bg-cm-accent px-4 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          添加模型
        </button>
      </div>

      {/* 已配置的模型列表 */}
      {userModels.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-cm-border bg-cm-card-alt/50 p-12 text-center">
          <Key className="h-12 w-12 mx-auto text-cm-muted/40 mb-4" />
          <p className="text-cm-muted text-lg font-medium mb-2">还没有配置任何模型</p>
          <p className="text-cm-muted/70 text-sm mb-6">点击上方"添加模型"按钮开始配置</p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-cm-accent px-5 py-2.5 text-sm font-medium text-white shadow-accent"
          >
            <Plus className="h-4 w-4" />
            立即添加
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {userModels.map((model) => (
            <ModelCard key={model.id} model={model} onRemove={removeUserModel} onUpdate={updateUserModel} />
          ))}
        </div>
      )}

      {/* 添加模型弹窗 */}
      <AnimatePresence>
        {showAdd && (
          <AddModelModal onClose={() => setShowAdd(false)} onAdd={addUserModel} />
        )}
      </AnimatePresence>
    </div>
  )
}

function ModelCard({ model, onRemove, onUpdate }: {
  model: UserModel
  onRemove: (id: string) => void
  onUpdate: (id: string, updates: Partial<UserModel>) => void
}) {
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null)
  const provider = PROVIDERS.find((p) => p.id === model.providerId)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const ok = await testConnection(model.baseUrl, model.apiKey, model.model)
    setTestResult(ok ? 'success' : 'fail')
    setTesting(false)
    setTimeout(() => setTestResult(null), 3000)
  }

  return (
    <div className="rounded-2xl border border-cm-border bg-cm-card p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <BrandIcon src={provider?.iconUrl || ''} name={provider?.name || 'AI'} size={28} />
        <div className="flex-1 min-w-0 space-y-3">
          {/* 标题行 */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-cm-text">{model.label || model.model}</h3>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-cm-muted">
                <span>{provider?.name}</span>
                <span className="text-cm-border">·</span>
                <span className="font-mono">{model.model}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {testResult === 'success' && (
                <span className="flex items-center gap-1 text-xs text-cm-green">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 连接成功
                </span>
              )}
              {testResult === 'fail' && (
                <span className="flex items-center gap-1 text-xs text-cm-red">
                  <XCircle className="h-3.5 w-3.5" /> 连接失败
                </span>
              )}
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-1.5 rounded-lg border border-cm-accent/30 px-3 py-1.5 text-xs font-medium text-cm-accent hover:bg-cm-accent-light transition-colors disabled:opacity-50"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
                测试
              </button>
              <button
                onClick={() => onRemove(model.id)}
                className="rounded-lg p-1.5 text-cm-muted hover:bg-cm-red/10 hover:text-cm-red transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 配置详情 */}
          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-cm-muted w-16 shrink-0">Base URL</span>
              <code className="flex-1 rounded-lg bg-cm-card-alt px-3 py-1.5 text-xs font-mono text-cm-text-secondary truncate">
                {model.baseUrl}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-cm-muted w-16 shrink-0">API Key</span>
              <div className="flex-1 flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-cm-card-alt px-3 py-1.5 text-xs font-mono text-cm-text-secondary truncate">
                  {showKey ? model.apiKey : '••••••••••••••••'}
                </code>
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="rounded-lg p-1.5 text-cm-muted hover:text-cm-text transition-colors"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddModelModal({ onClose, onAdd }: {
  onClose: () => void
  onAdd: (model: Omit<UserModel, 'id'>) => string
}) {
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [label, setLabel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null)

  const provider = PROVIDERS.find((p) => p.id === selectedProvider)

  const handleSelectProvider = (id: string) => {
    const p = PROVIDERS.find((pr) => pr.id === id)
    setSelectedProvider(id)
    setBaseUrl(p?.baseUrl || '')
    setModel(p?.defaultModel || '')
    setLabel('')
    setTestResult(null)
  }

  const handleAdd = () => {
    if (!selectedProvider || !apiKey || !model) return
    onAdd({
      providerId: selectedProvider,
      baseUrl,
      apiKey,
      model,
      label: label || `${provider?.name} · ${model}`,
    })
    onClose()
  }

  const handleTest = async () => {
    if (!apiKey || !model) return
    setTesting(true)
    setTestResult(null)
    const ok = await testConnection(baseUrl, apiKey, model)
    setTestResult(ok ? 'success' : 'fail')
    setTesting(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-cm-surface shadow-soft-lg border border-cm-border"
      >
        <div className="p-6">
          <h2 className="font-display text-xl font-bold text-cm-text mb-1">添加模型</h2>
          <p className="text-sm text-cm-muted mb-6">选择厂商，填写 API Key 和模型名称</p>

          {/* 厂商选择 */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-cm-text mb-2">选择厂商</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProvider(p.id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all',
                    selectedProvider === p.id
                      ? 'border-cm-accent bg-cm-accent-light shadow-accent'
                      : 'border-cm-border bg-cm-card hover:border-cm-accent/40 hover:shadow-soft'
                  )}
                >
                  <BrandIcon src={p.iconUrl} name={p.name} size={28} />
                  <span className={cn(
                    'text-xs font-medium text-center leading-tight',
                    selectedProvider === p.id ? 'text-cm-accent' : 'text-cm-text-secondary'
                  )}>
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {selectedProvider && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4"
            >
              {/* Base URL */}
              <div>
                <label className="block text-sm font-medium text-cm-text mb-1.5">Base URL</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="w-full rounded-xl border border-cm-border bg-cm-bg px-4 py-2.5 text-sm font-mono text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30"
                />
                <p className="mt-1 text-xs text-cm-muted">已预填，通常无需修改</p>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-cm-text mb-1.5">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-xl border border-cm-border bg-cm-bg px-4 py-2.5 text-sm font-mono text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30"
                />
                <p className="mt-1 text-xs text-cm-muted">密钥仅保存在本地浏览器中</p>
              </div>

              {/* Model */}
              <div>
                <label className="block text-sm font-medium text-cm-text mb-1.5">模型名称</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o"
                  className="w-full rounded-xl border border-cm-border bg-cm-bg px-4 py-2.5 text-sm font-mono text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30"
                />
                <p className="mt-1 text-xs text-cm-muted">
                  {provider?.description || '填写该厂商支持的模型名称'}
                </p>
              </div>

              {/* Label */}
              <div>
                <label className="block text-sm font-medium text-cm-text mb-1.5">
                  显示名称 <span className="text-cm-muted font-normal">（可选）</span>
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={`我的 ${provider?.defaultModel || '模型'}`}
                  className="w-full rounded-xl border border-cm-border bg-cm-bg px-4 py-2.5 text-sm text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30"
                />
              </div>

              {/* 测试结果 */}
              {testResult && (
                <div className={cn(
                  'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm',
                  testResult === 'success' ? 'bg-cm-green-light text-cm-green' : 'bg-cm-red/10 text-cm-red'
                )}>
                  {testResult === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {testResult === 'success' ? '连接成功！可以正常使用' : '连接失败，请检查 API Key 和模型名称'}
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={handleTest}
                  disabled={!apiKey || !model || testing}
                  className="flex items-center gap-2 rounded-xl border border-cm-accent/30 px-4 py-2.5 text-sm font-medium text-cm-accent hover:bg-cm-accent-light transition-colors disabled:opacity-40"
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
                  测试连接
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!apiKey || !model}
                  className="flex items-center gap-2 rounded-xl bg-cm-accent px-5 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  <Save className="h-4 w-4" />
                  保存
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ==================== 模型设置 Tab ====================
function ModelTab() {
  const { modelParams, setModelParams, activeModelId, userModels } = useSettingsStore()
  const activeModel = userModels.find((m) => m.id === activeModelId)

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-cm-text">模型参数</h2>
        <p className="text-sm text-cm-muted mt-1">调整当前活跃模型的生成参数</p>
      </div>

      {/* 当前模型 */}
      <div className="rounded-2xl border border-cm-border bg-cm-card p-4 shadow-soft">
        <div className="text-sm text-cm-muted mb-1">当前活跃模型</div>
        <div className="flex items-center gap-2">
          <BrandIcon src={PROVIDERS.find((p) => p.id === activeModel?.providerId)?.iconUrl || ''} name={PROVIDERS.find((p) => p.id === activeModel?.providerId)?.name || 'AI'} size={20} />
          <span className="font-semibold text-cm-text">{activeModel?.label || activeModel?.model || '未选择'}</span>
          {activeModel && (
            <span className="text-xs text-cm-muted font-mono">({activeModel.model})</span>
          )}
        </div>
      </div>

      {/* Temperature */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-cm-text">Temperature</label>
          <span className="text-sm font-mono text-cm-accent">{modelParams.temperature}</span>
        </div>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={modelParams.temperature}
          onChange={(e) => setModelParams({ temperature: parseFloat(e.target.value) })}
          className="w-full accent-cm-accent"
        />
        <div className="flex justify-between text-xs text-cm-muted mt-1">
          <span>精确</span>
          <span>创意</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-cm-text">最大 Token 数</label>
          <span className="text-sm font-mono text-cm-accent">{modelParams.maxTokens}</span>
        </div>
        <input
          type="range"
          min="256"
          max="131072"
          step="256"
          value={modelParams.maxTokens}
          onChange={(e) => setModelParams({ maxTokens: parseInt(e.target.value) })}
          className="w-full accent-cm-accent"
        />
        <div className="flex justify-between text-xs text-cm-muted mt-1">
          <span>256</span>
          <span>131072</span>
        </div>
      </div>
    </div>
  )
}

// ==================== 学习偏好 Tab ====================
function LearningTab() {
  const { learningPrefs, setLearningPrefs } = useSettingsStore()

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-cm-text">学习偏好</h2>
        <p className="text-sm text-cm-muted mt-1">定制你的学习节奏和风格</p>
      </div>

      {/* 每日学习时间 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-cm-text">每日学习时间</label>
          <span className="text-sm font-mono text-cm-accent">{learningPrefs.dailyMinutes} 分钟</span>
        </div>
        <div className="flex gap-2">
          {[15, 30, 60, 90, 120].map((min) => (
            <button
              key={min}
              onClick={() => setLearningPrefs({ dailyMinutes: min })}
              className={cn(
                'flex-1 rounded-xl py-2 text-sm font-medium transition-colors',
                learningPrefs.dailyMinutes === min
                  ? 'bg-cm-accent text-white shadow-accent'
                  : 'bg-cm-card border border-cm-border text-cm-text-secondary hover:border-cm-accent/40'
              )}
            >
              {min}分
            </button>
          ))}
        </div>
      </div>

      {/* 学习风格 */}
      <div>
        <label className="block text-sm font-medium text-cm-text mb-2">学习风格</label>
        <div className="grid grid-cols-3 gap-3">
          {([
            { id: 'balanced' as const, label: '均衡模式', desc: '理论与实战并重', icon: '⚖️' },
            { id: 'theory' as const, label: '理论优先', desc: '深入理解原理', icon: '📖' },
            { id: 'practice' as const, label: '实战优先', desc: '动手做项目', icon: '💻' },
          ]).map((style) => (
            <button
              key={style.id}
              onClick={() => setLearningPrefs({ style: style.id })}
              className={cn(
                'rounded-2xl border p-4 text-center transition-all',
                learningPrefs.style === style.id
                  ? 'border-cm-accent bg-cm-accent-light shadow-accent'
                  : 'border-cm-border bg-cm-card hover:border-cm-accent/40'
              )}
            >
              <span className="text-2xl">{style.icon}</span>
              <div className={cn(
                'text-sm font-medium mt-2',
                learningPrefs.style === style.id ? 'text-cm-accent' : 'text-cm-text'
              )}>
                {style.label}
              </div>
              <div className="text-xs text-cm-muted mt-1">{style.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 难度偏好 */}
      <div>
        <label className="block text-sm font-medium text-cm-text mb-2">难度偏好</label>
        <div className="grid grid-cols-3 gap-3">
          {([
            { id: 'progressive' as const, label: '渐进式', desc: '由浅入深', icon: '📈' },
            { id: 'standard' as const, label: '标准式', desc: '稳步推进', icon: '📊' },
            { id: 'challenge' as const, label: '挑战式', desc: '高难度快节奏', icon: '🔥' },
          ]).map((diff) => (
            <button
              key={diff.id}
              onClick={() => setLearningPrefs({ difficulty: diff.id })}
              className={cn(
                'rounded-2xl border p-4 text-center transition-all',
                learningPrefs.difficulty === diff.id
                  ? 'border-cm-accent bg-cm-accent-light shadow-accent'
                  : 'border-cm-border bg-cm-card hover:border-cm-accent/40'
              )}
            >
              <span className="text-2xl">{diff.icon}</span>
              <div className={cn(
                'text-sm font-medium mt-2',
                learningPrefs.difficulty === diff.id ? 'text-cm-accent' : 'text-cm-text'
              )}>
                {diff.label}
              </div>
              <div className="text-xs text-cm-muted mt-1">{diff.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ==================== 外观主题 Tab ====================
function AppearanceTab() {
  const { theme, setTheme, accentColor, setAccentColor, editorFontSize, setEditorFontSize, resetToDefaults } = useSettingsStore()

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-cm-text">外观主题</h2>
        <p className="text-sm text-cm-muted mt-1">个性化你的学习环境</p>
      </div>

      {/* 主题 */}
      <div>
        <label className="block text-sm font-medium text-cm-text mb-2">主题模式</label>
        <div className="grid grid-cols-2 gap-3">
          {([
            { id: 'light' as const, label: '浅色', preview: 'bg-cm-bg border-cm-border', icon: '☀️' },
            { id: 'dark' as const, label: '深色', preview: 'bg-slate-900 border-slate-700', icon: '🌙' },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={cn(
                'rounded-2xl border p-4 text-center transition-all',
                theme === t.id
                  ? 'border-cm-accent shadow-accent'
                  : 'border-cm-border hover:border-cm-accent/40'
              )}
            >
              <div className={cn('h-16 rounded-xl border mb-3', t.preview)} />
              <span className="text-lg mr-1">{t.icon}</span>
              <span className={cn('text-sm font-medium', theme === t.id ? 'text-cm-accent' : 'text-cm-text')}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 强调色 */}
      <div>
        <label className="block text-sm font-medium text-cm-text mb-2">强调色</label>
        <div className="flex gap-3">
          {([
            { id: 'amber' as const, color: 'bg-cm-amber', label: '琥珀金' },
            { id: 'green' as const, color: 'bg-cm-green', label: '鼠尾草绿' },
            { id: 'purple' as const, color: 'bg-cm-purple', label: '薰衣草紫' },
          ]).map((c) => (
            <button
              key={c.id}
              onClick={() => setAccentColor(c.id)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all',
                accentColor === c.id
                  ? 'border-cm-accent shadow-accent'
                  : 'border-cm-border hover:border-cm-accent/40'
              )}
            >
              <div className={cn('h-8 w-8 rounded-full', c.color)} />
              <span className="text-xs font-medium text-cm-text-secondary">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 编辑器字体大小 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-cm-text">编辑器字体大小</label>
          <span className="text-sm font-mono text-cm-accent">{editorFontSize}px</span>
        </div>
        <input
          type="range"
          min="12"
          max="20"
          step="1"
          value={editorFontSize}
          onChange={(e) => setEditorFontSize(parseInt(e.target.value))}
          className="w-full accent-cm-accent"
        />
        <div className="flex justify-between text-xs text-cm-muted mt-1">
          <span>12px</span>
          <span>20px</span>
        </div>
      </div>

      {/* 重置 */}
      <div className="pt-4 border-t border-cm-border">
        <button
          onClick={resetToDefaults}
          className="flex items-center gap-2 rounded-xl border border-cm-border px-4 py-2.5 text-sm text-cm-muted hover:text-cm-text hover:border-cm-accent/40 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          恢复默认设置
        </button>
      </div>
    </div>
  )
}

// ==================== 本地环境 Tab ====================
const LANG_COMMANDS: Record<string, { detect: string; run: string; install: string; version: string }> = {
  python: { detect: 'python --version', run: 'python', install: 'npm install -g pyright && pip install python', version: '3.12' },
  javascript: { detect: 'node --version', run: 'node', install: 'npm install -g n && n lts', version: '20 LTS' },
  typescript: { detect: 'tsc --version', run: 'npx tsx', install: 'npm install -g typescript ts-node', version: '5.x' },
  java: { detect: 'java -version', run: 'java', install: 'npm install -g npm-jdk && npx npm-jdk install 21', version: '21 LTS' },
  cpp: { detect: 'g++ --version', run: 'g++', install: 'npm install -g @aspect-build/aspect-cli', version: '13.x' },
  go: { detect: 'go version', run: 'go run', install: 'npm install -g go-npm && npx go-npm install', version: '1.22' },
  rust: { detect: 'rustc --version', run: 'cargo run', install: 'npm install -g rustup-init', version: '1.77' },
  swift: { detect: 'swift --version', run: 'swift', install: 'npm install -g swift-npm || xcode-select --install', version: '5.9' },
  kotlin: { detect: 'kotlin -version', run: 'kotlinc', install: 'npm install -g kotlin-compiler', version: '1.9' },
  ruby: { detect: 'ruby --version', run: 'ruby', install: 'npm install -g ruby-npm', version: '3.2' },
  php: { detect: 'php --version', run: 'php', install: 'npm install -g php-npm', version: '8.3' },
  csharp: { detect: 'dotnet --version', run: 'dotnet run', install: 'npm install -g dotnet-npm', version: '8.0' },
  dart: { detect: 'dart --version', run: 'dart run', install: 'npm install -g dart-npm', version: '3.3' },
  scala: { detect: 'scala -version', run: 'scala', install: 'npm install -g scala-cli', version: '3.4' },
  sql: { detect: 'sqlite3 --version', run: 'sqlite3', install: 'npm install -g sql.js-cli', version: '3.x' },
}

function EnvironmentTab() {
  const { envConfigs, addEnvConfig, removeEnvConfig, updateEnvConfig } = useSettingsStore()
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-cm-text">本地开发环境</h2>
          <p className="text-sm text-cm-muted mt-1">配置编程语言的本地运行环境，用于代码执行和练习</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl bg-cm-accent px-4 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          添加环境
        </button>
      </div>

      {envConfigs.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-cm-border bg-cm-card-alt/50 p-12 text-center">
          <Terminal className="h-12 w-12 mx-auto text-cm-muted/40 mb-4" />
          <p className="text-cm-muted text-lg font-medium mb-2">还没有配置本地环境</p>
          <p className="text-cm-muted/70 text-sm mb-6">配置后可在学习时运行和测试代码</p>
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 rounded-xl bg-cm-accent px-5 py-2.5 text-sm font-medium text-white shadow-accent">
            <Plus className="h-4 w-4" />
            立即配置
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {envConfigs.map((env) => (
            <EnvCard key={env.id} env={env} onRemove={removeEnvConfig} onUpdate={updateEnvConfig} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showAdd && <AddEnvModal onClose={() => setShowAdd(false)} onAdd={addEnvConfig} />}
      </AnimatePresence>
    </div>
  )
}

function EnvCard({ env, onRemove, onUpdate }: {
  env: EnvConfig
  onRemove: (id: string) => void
  onUpdate: (id: string, updates: Partial<EnvConfig>) => void
}) {
  const [detecting, setDetecting] = useState(false)
  const [detectResult, setDetectResult] = useState<'installed' | 'not_found' | null>(null)
  const lang = LANGUAGES.find(l => l.id === env.languageId)

  const handleDetect = async () => {
    setDetecting(true)
    setDetectResult(null)
    try {
      // 尝试运行语言版本检测命令
      const command = env.detectCommand
      // 在浏览器环境中无法直接执行，模拟检测
      await new Promise(r => setTimeout(r, 1000))
      setDetectResult('installed')
    } catch {
      setDetectResult('not_found')
    }
    setDetecting(false)
    setTimeout(() => setDetectResult(null), 5000)
  }

  return (
    <div className="rounded-2xl border border-cm-border bg-cm-card p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <BrandIcon src={lang?.iconUrl || ''} name={lang?.name || env.languageId} size={28} rounded bgColor={lang?.color} />
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-cm-text">{env.label || lang?.name || env.languageId}</h3>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-cm-muted">
                <span>{lang?.name || env.languageId}</span>
                <span className="text-cm-border">·</span>
                <span className="font-mono">{env.version || '未指定版本'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {detectResult === 'installed' && (
                <span className="flex items-center gap-1 text-xs text-cm-green">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 已安装
                </span>
              )}
              {detectResult === 'not_found' && (
                <span className="flex items-center gap-1 text-xs text-cm-red">
                  <XCircle className="h-3.5 w-3.5" /> 未检测到
                </span>
              )}
              <button onClick={handleDetect} disabled={detecting}
                className="flex items-center gap-1.5 rounded-lg border border-cm-accent/30 px-3 py-1.5 text-xs font-medium text-cm-accent hover:bg-cm-accent-light transition-colors disabled:opacity-50">
                {detecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Terminal className="h-3.5 w-3.5" />}
                检测
              </button>
              <button onClick={() => onRemove(env.id)}
                className="rounded-lg p-1.5 text-cm-muted hover:bg-cm-red/10 hover:text-cm-red transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-cm-muted w-20 shrink-0">安装路径</span>
              <code className="flex-1 rounded-lg bg-cm-card-alt px-3 py-1.5 text-xs font-mono text-cm-text-secondary truncate">
                {env.installPath || '默认路径'}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-cm-muted w-20 shrink-0">检测命令</span>
              <code className="flex-1 rounded-lg bg-cm-card-alt px-3 py-1.5 text-xs font-mono text-cm-text-secondary truncate">
                {env.detectCommand}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-cm-muted w-20 shrink-0">运行命令</span>
              <code className="flex-1 rounded-lg bg-cm-card-alt px-3 py-1.5 text-xs font-mono text-cm-text-secondary truncate">
                {env.runCommand}
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddEnvModal({ onClose, onAdd }: {
  onClose: () => void
  onAdd: (config: Omit<EnvConfig, 'id'>) => string
}) {
  const [selectedLang, setSelectedLang] = useState('')
  const [label, setLabel] = useState('')
  const [version, setVersion] = useState('')
  const [installPath, setInstallPath] = useState('')
  const [detectCommand, setDetectCommand] = useState('')
  const [runCommand, setRunCommand] = useState('')
  const [installCommand, setInstallCommand] = useState('')

  const handleSelectLang = (id: string) => {
    setSelectedLang(id)
    const lang = LANGUAGES.find(l => l.id === id)
    const cmds = LANG_COMMANDS[id]
    if (cmds) {
      setDetectCommand(cmds.detect)
      setRunCommand(cmds.run)
      setInstallCommand(cmds.install)
      setVersion(cmds.version)
    }
    setLabel(lang?.name || id)
    setInstallPath('')
  }

  const handleAdd = () => {
    if (!selectedLang || !detectCommand || !runCommand) return
    onAdd({
      languageId: selectedLang,
      label: label || LANGUAGES.find(l => l.id === selectedLang)?.name || selectedLang,
      version,
      installPath,
      detectCommand,
      runCommand,
      installCommand,
      status: 'unknown',
    })
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-cm-surface shadow-soft-lg border border-cm-border"
      >
        <div className="p-6">
          <h2 className="font-display text-xl font-bold text-cm-text mb-1">添加本地环境</h2>
          <p className="text-sm text-cm-muted mb-6">选择编程语言，配置运行环境</p>

          {/* 语言选择 */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-cm-text mb-2">选择语言</label>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => handleSelectLang(lang.id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all',
                    selectedLang === lang.id
                      ? 'border-cm-accent bg-cm-accent-light shadow-accent'
                      : 'border-cm-border bg-cm-card hover:border-cm-accent/40 hover:shadow-soft'
                  )}
                >
                  <BrandIcon src={lang.iconUrl} name={lang.name} size={24} rounded bgColor={lang.color} />
                  <span className={cn(
                    'text-[10px] font-medium text-center leading-tight',
                    selectedLang === lang.id ? 'text-cm-accent' : 'text-cm-text-secondary'
                  )}>
                    {lang.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {selectedLang && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4"
            >
              {/* 显示名称 */}
              <div>
                <label className="block text-sm font-medium text-cm-text mb-1.5">
                  显示名称 <span className="text-cm-muted font-normal">（可选）</span>
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={LANGUAGES.find(l => l.id === selectedLang)?.name || '环境名称'}
                  className="w-full rounded-xl border border-cm-border bg-cm-bg px-4 py-2.5 text-sm text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30"
                />
              </div>

              {/* 版本 */}
              <div>
                <label className="block text-sm font-medium text-cm-text mb-1.5">版本</label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="例如 3.12"
                  className="w-full rounded-xl border border-cm-border bg-cm-bg px-4 py-2.5 text-sm font-mono text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30"
                />
              </div>

              {/* 安装路径 */}
              <div>
                <label className="block text-sm font-medium text-cm-text mb-1.5">
                  安装路径 <span className="text-cm-muted font-normal">（可选）</span>
                </label>
                <input
                  type="text"
                  value={installPath}
                  onChange={(e) => setInstallPath(e.target.value)}
                  placeholder="默认路径"
                  className="w-full rounded-xl border border-cm-border bg-cm-bg px-4 py-2.5 text-sm font-mono text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30"
                />
              </div>

              {/* 检测命令 */}
              <div>
                <label className="block text-sm font-medium text-cm-text mb-1.5">检测命令</label>
                <input
                  type="text"
                  value={detectCommand}
                  onChange={(e) => setDetectCommand(e.target.value)}
                  placeholder="python --version"
                  className="w-full rounded-xl border border-cm-border bg-cm-bg px-4 py-2.5 text-sm font-mono text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30"
                />
              </div>

              {/* 运行命令 */}
              <div>
                <label className="block text-sm font-medium text-cm-text mb-1.5">运行命令</label>
                <input
                  type="text"
                  value={runCommand}
                  onChange={(e) => setRunCommand(e.target.value)}
                  placeholder="python"
                  className="w-full rounded-xl border border-cm-border bg-cm-bg px-4 py-2.5 text-sm font-mono text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30"
                />
              </div>

              {/* 安装命令 */}
              <div>
                <label className="block text-sm font-medium text-cm-text mb-1.5">
                  安装命令 <span className="text-cm-muted font-normal">（可选）</span>
                </label>
                <input
                  type="text"
                  value={installCommand}
                  onChange={(e) => setInstallCommand(e.target.value)}
                  placeholder="npm install -g ..."
                  className="w-full rounded-xl border border-cm-border bg-cm-bg px-4 py-2.5 text-sm font-mono text-cm-text placeholder:text-cm-muted/50 focus:border-cm-accent focus:outline-none focus:ring-1 focus:ring-cm-accent/30"
                />
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={handleAdd}
                  disabled={!detectCommand || !runCommand}
                  className="flex items-center gap-2 rounded-xl bg-cm-accent px-5 py-2.5 text-sm font-medium text-white shadow-accent hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  <Save className="h-4 w-4" />
                  保存
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { Play, Square, Loader2, Terminal, CheckCircle, XCircle } from 'lucide-react'
import CodeEditor from './CodeEditor'
import { executeCode, getAvailableLanguages, type ExecuteResult } from '@/services/api'
import { cn } from '@/lib/utils'

interface CodeRunnerProps {
  initialCode?: string
  language?: string
  height?: string
  showInput?: boolean
}

// 前端语言名映射到后端执行语言
const LANG_MAP: Record<string, string> = {
  python: 'python',
  py: 'python',
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  bash: 'bash',
  sh: 'bash',
}

export default function CodeRunner({
  initialCode = '',
  language = 'python',
  height = '300px',
  showInput = true,
}: CodeRunnerProps) {
  const [code, setCode] = useState(initialCode)
  const [stdin, setStdin] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ExecuteResult | null>(null)
  const [error, setError] = useState('')
  const [availableLangs, setAvailableLangs] = useState<Record<string, string>>({})

  useEffect(() => {
    getAvailableLanguages().then(setAvailableLangs)
  }, [])

  // 当 initialCode 外部变化时更新
  useEffect(() => {
    setCode(initialCode)
  }, [initialCode])

  const execLang = LANG_MAP[language.toLowerCase()] || 'python'
  const isSupported = !!availableLangs[execLang]

  const handleRun = useCallback(async () => {
    if (!code.trim()) {
      setError('请先编写代码')
      return
    }

    setRunning(true)
    setError('')
    setResult(null)

    try {
      const res = await executeCode(execLang, code, stdin || undefined)
      setResult(res)
    } catch (err: any) {
      setError(err.message || '执行失败')
    } finally {
      setRunning(false)
    }
  }, [code, stdin, execLang])

  return (
    <div className="space-y-3">
      {/* 编辑器 */}
      <CodeEditor
        initialValue={code}
        language={language}
        onChange={(v) => setCode(v || '')}
        height={height}
      />

      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={running || !code.trim()}
            className="flex items-center gap-2 rounded-xl bg-cm-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cm-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                运行中...
              </>
            ) : (
              <>
                <Play size={16} />
                运行
              </>
            )}
          </button>
          {!isSupported && !running && (
            <span className="text-xs text-cm-amber">
              {execLang} 运行环境未安装
            </span>
          )}
        </div>
        {result && (
          <div className="flex items-center gap-3 text-xs text-cm-muted">
            <span className={cn('flex items-center gap-1', result.success ? 'text-cm-green' : 'text-cm-red')}>
              {result.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {result.success ? '成功' : '失败'}
            </span>
            <span>{result.execTime}</span>
            {result.signal && <span className="text-cm-red">信号: {result.signal}</span>}
          </div>
        )}
      </div>

      {/* stdin 输入 */}
      {showInput && (
        <details className="rounded-xl border border-cm-border bg-cm-card-alt">
          <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-cm-muted">
            标准输入 (stdin)
          </summary>
          <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="如果程序需要输入，请在这里填写..."
            className="w-full bg-cm-bg px-4 pb-3 text-sm text-cm-text outline-none resize-y min-h-[60px] font-mono"
          />
        </details>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-cm-red/30 bg-cm-red/10 px-4 py-2.5 text-sm text-cm-red">
          <XCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* 输出结果 */}
      {result && (
        <div className="rounded-xl border border-cm-border bg-cm-card-alt overflow-hidden">
          <div className="flex items-center gap-2 border-b border-cm-border bg-cm-card px-4 py-2">
            <Terminal size={14} className="text-cm-muted" />
            <span className="text-xs font-medium text-cm-muted">输出结果</span>
            <span className="text-xs text-cm-muted">
              (退出码: {result.exitCode})
            </span>
          </div>
          <div className="p-4 space-y-2">
            {result.stdout && (
              <pre className="text-sm text-cm-text font-mono whitespace-pre-wrap break-all">
                {result.stdout}
              </pre>
            )}
            {result.stderr && (
              <pre className="text-sm text-cm-red font-mono whitespace-pre-wrap break-all">
                {result.stderr}
              </pre>
            )}
            {!result.stdout && !result.stderr && (
              <p className="text-sm text-cm-muted italic">(无输出)</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

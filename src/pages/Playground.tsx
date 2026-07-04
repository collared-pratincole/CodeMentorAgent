import { useState, useEffect } from 'react'
import { Play, Trash2, FileCode } from 'lucide-react'
import CodeRunner from '@/components/editor/CodeRunner'
import { getAvailableLanguages } from '@/services/api'
import GlowCard from '@/components/common/GlowCard'

const DEFAULT_CODE: Record<string, string> = {
  python: `# 欢迎使用代码练习场
# 在这里写代码，点击运行即可在本地执行

def greet(name):
    return f"你好，{name}！欢迎学习编程 👋"

print(greet("世界"))

# 试试计算斐波那契数列
def fib(n):
    if n <= 1:
        return n
    return fib(n-1) + fib(n-2)

for i in range(10):
    print(f"fib({i}) = {fib(i)}")
`,
  javascript: `// 欢迎使用代码练习场
// 在这里写代码，点击运行即可在本地执行

function greet(name) {
  return \`你好，\${name}！欢迎学习编程 👋\`
}

console.log(greet("世界"))

// 试试计算斐波那契数列
function fib(n) {
  if (n <= 1) return n
  return fib(n - 1) + fib(n - 2)
}

for (let i = 0; i < 10; i++) {
  console.log(\`fib(\${i}) = \${fib(i)}\`)
}
`,
}

export default function Playground() {
  const [language, setLanguage] = useState('python')
  const [availableLangs, setAvailableLangs] = useState<Record<string, string>>({})
  const [runKey, setRunKey] = useState(0)

  useEffect(() => {
    getAvailableLanguages().then(setAvailableLangs)
  }, [])

  const langLabels: Record<string, string> = {
    python: 'Python',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    bash: 'Bash',
    go: 'Go',
    ruby: 'Ruby',
    php: 'PHP',
    java: 'Java',
    cpp: 'C++',
    rust: 'Rust',
  }

  return (
    <div className="min-h-screen bg-cm-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileCode size={24} className="text-cm-accent" />
            <div>
              <h1 className="text-xl font-bold text-cm-text">代码练习场</h1>
              <p className="text-xs text-cm-muted">在本地环境中运行代码，支持 stdin 输入</p>
            </div>
          </div>
          <button
            onClick={() => setRunKey((k) => k + 1)}
            className="flex items-center gap-1.5 rounded-xl border border-cm-border bg-cm-card px-3 py-2 text-xs text-cm-muted transition-colors hover:border-cm-red/50 hover:text-cm-red"
          >
            <Trash2 size={14} />
            清空
          </button>
        </div>

        {/* 语言选择 */}
        <GlowCard>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-cm-muted">选择语言：</span>
            {Object.entries(availableLangs).map(([lang, version]) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                  language === lang
                    ? 'bg-cm-accent text-white'
                    : 'bg-cm-card-alt text-cm-muted hover:text-cm-text'
                }`}
              >
                {langLabels[lang] || lang}
                <span className="ml-1.5 text-xs opacity-60">{version.split(' ')[0]}</span>
              </button>
            ))}
            {Object.keys(availableLangs).length === 0 && (
              <span className="text-xs text-cm-amber">正在检测可用语言...</span>
            )}
          </div>
        </GlowCard>

        {/* Code Runner */}
        <div key={`${language}-${runKey}`}>
          <CodeRunner
            initialCode={DEFAULT_CODE[language] || `// ${language}\nconsole.log("Hello!")\n`}
            language={language}
            height="400px"
          />
        </div>
      </div>
    </div>
  )
}

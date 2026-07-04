import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Plus,
  Code2,
  Wand2,
  Bug,
  TestTube2,
  FileCode2,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useChatStore } from '@/stores/useChatStore';
import { createProvider } from '@/services/ai';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUserStore } from '@/stores/useUserStore';
import ModelSelector from '@/components/common/ModelSelector';
import CodeRunner from '@/components/editor/CodeRunner';

const WELCOME_CONTENT = `你好！我是 CodeMentor AI 助手 🎓

我是你的专属编程导师，可以帮你：
• **解释代码** — 粘贴代码，我帮你逐行解读
• **逐行注释** — 为代码逐行添加中文注释，适合新手学习
• **优化代码** — 提升性能和可读性
• **Debug 帮助** — 快速定位和修复问题
• **生成测试** — 自动生成单元测试用例
• **学习指导** — 根据你的进度提供个性化建议

请先在设置中配置 AI 模型和 API Key，然后就可以开始对话了！`;

const quickActions = [
  { label: '解释代码', icon: Code2, prompt: '请解释以下代码的功能和工作原理：\n\n' },
  { label: '逐行注释', icon: FileCode2, prompt: '请为以下代码逐行添加中文注释，解释每一行代码的作用和原理，适合编程新手理解：\n\n' },
  { label: '优化代码', icon: Wand2, prompt: '请优化以下代码，提高性能和可读性：\n\n' },
  { label: '生成测试', icon: TestTube2, prompt: '请为以下代码生成单元测试：\n\n' },
  { label: 'Debug 帮助', icon: Bug, prompt: '以下代码有问题，请帮我找出 bug 并修复：\n\n' },
];

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

export default function AIChat() {
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const createSession = useChatStore((s) => s.createSession);
  const selectSession = useChatStore((s) => s.selectSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateLastAssistantMessage = useChatStore((s) => s.updateLastAssistantMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const messages = currentSession?.messages ?? [];

  const [input, setInput] = useState('');
  const [sidePanelCode, setSidePanelCode] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 首次进入：无会话时自动创建一个，并放入欢迎语
  useEffect(() => {
    if (!initialized) {
      if (sessions.length === 0) {
        const id = createSession();
        // 给新会话放入欢迎语
        useChatStore.setState((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id
              ? {
                  ...s,
                  title: '欢迎',
                  messages: [
                    {
                      id: `msg-${Date.now()}`,
                      role: 'assistant' as const,
                      content: WELCOME_CONTENT,
                      timestamp: Date.now(),
                    },
                  ],
                }
              : s
          ),
        }));
      } else if (!currentSessionId) {
        selectSession(sessions[0].id);
      }
      setInitialized(true);
    }
  }, [initialized, sessions.length, currentSessionId, createSession, selectSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    // 确保有会话
    if (!currentSessionId) {
      createSession();
    }

    addMessage({ role: 'user', content: text });
    setInput('');
    setStreaming(true);

    const activeModel = useSettingsStore.getState().getActiveModel();
    if (!activeModel) {
      addMessage({ role: 'assistant', content: '请先在设置中配置 AI 模型和 API Key。' });
      setStreaming(false);
      return;
    }

    try {
      const provider = createProvider(activeModel.baseUrl, activeModel.model);
      const systemMsg = {
        role: 'system' as const,
        content:
          '你是 CodeMentor AI，一位专业的编程导师助手。你的职责是：1. 帮助用户理解和解释代码；2. 提供编程建议和最佳实践；3. 帮助调试和修复代码问题；4. 生成代码示例和单元测试；5. 根据用户的学习进度提供个性化指导。请用中文回答，回答要简洁实用。',
      };
      const chatMessages = [
        systemMsg,
        ...useChatStore.getState().getCurrentMessages().map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
      ];
      chatMessages.push({ role: 'user', content: text });
      const recentMessages = chatMessages.slice(-20);

      let fullResponse = '';
      addMessage({ role: 'assistant', content: '' });

      await provider.sendMessage(recentMessages, { userId: useUserStore.getState().currentUserId!, modelId: activeModel.id }, (chunk) => {
        fullResponse += chunk;
        updateLastAssistantMessage(fullResponse);
      });

      setStreaming(false);
    } catch (err: any) {
      addMessage({ role: 'assistant', content: `请求失败：${err.message || '请检查模型配置'}` });
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const handleOpenInEditor = (code: string) => {
    setSidePanelCode(code);
  };

  const handleSendFromEditor = async () => {
    if (!sidePanelCode.trim()) return;

    const codeMessage = `请分析以下代码：\n\n\`\`\`python\n${sidePanelCode}\n\`\`\``;
    addMessage({ role: 'user', content: codeMessage });
    setStreaming(true);

    const activeModel = useSettingsStore.getState().getActiveModel();
    if (!activeModel) {
      addMessage({ role: 'assistant', content: '请先在设置中配置 AI 模型和 API Key。' });
      setStreaming(false);
      return;
    }

    try {
      const provider = createProvider(activeModel.baseUrl, activeModel.model);
      const systemMsg = {
        role: 'system' as const,
        content:
          '你是 CodeMentor AI，一位专业的编程导师助手。你的职责是：1. 帮助用户理解和解释代码；2. 提供编程建议和最佳实践；3. 帮助调试和修复代码问题；4. 生成代码示例和单元测试；5. 根据用户的学习进度提供个性化指导。请用中文回答，回答要简洁实用。',
      };
      const chatMessages = [
        systemMsg,
        ...useChatStore.getState().getCurrentMessages().map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
      ];
      chatMessages.push({ role: 'user', content: codeMessage });
      const recentMessages = chatMessages.slice(-20);

      let fullResponse = '';
      addMessage({ role: 'assistant', content: '' });

      await provider.sendMessage(recentMessages, { userId: useUserStore.getState().currentUserId!, modelId: activeModel.id }, (chunk) => {
        fullResponse += chunk;
        updateLastAssistantMessage(fullResponse);
      });

      setStreaming(false);
    } catch (err: any) {
      addMessage({ role: 'assistant', content: `请求失败：${err.message || '请检查模型配置'}` });
      setStreaming(false);
    }
  };

  const handleNewSession = () => {
    if (isStreaming) return;
    createSession();
    setSidePanelCode('');
  };

  const handleDeleteSession = (id: string) => {
    if (isStreaming) return;
    deleteSession(id);
  };

  const handleSelectSession = (id: string) => {
    if (isStreaming || id === currentSessionId) return;
    selectSession(id);
    setSidePanelCode('');
  };

  const renderMessageContent = (content: string) => {
    const parts: React.ReactNode[] = [];
    const lines = content.split('\n');
    let inCodeBlock = false;
    let codeContent = '';
    let codeLang = '';
    let codeKey = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 检测代码块标记（支持缩进的 ```）
      if (trimmed.startsWith('```')) {
        if (inCodeBlock) {
          // 代码块结束
          parts.push(
            <CodeBlockMessage
              key={`code-${codeKey++}`}
              code={codeContent.trim()}
              language={codeLang}
              onOpenInEditor={handleOpenInEditor}
            />
          );
          codeContent = '';
          codeLang = '';
          inCodeBlock = false;
        } else {
          // 代码块开始，提取语言标识
          inCodeBlock = true;
          codeLang = trimmed.slice(3).trim() || 'python';
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent += line + '\n';
        continue;
      }

      if (line.trim() === '') {
        parts.push(<br key={`br-${i}`} />);
      } else {
        parts.push(
          <span key={`line-${i}`}>
            {renderInlineMarkdown(line)}
            {i < lines.length - 1 && <br />}
          </span>
        );
      }
    }

    // 处理未闭合的代码块（AI 流式输出中断或格式不完整）
    if (inCodeBlock && codeContent.trim()) {
      parts.push(
        <CodeBlockMessage
          key={`code-unclosed-${codeKey++}`}
          code={codeContent.trim()}
          language={codeLang}
          onOpenInEditor={handleOpenInEditor}
        />
      );
    }

    return parts;
  };

  const renderInlineMarkdown = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const codeMatch = remaining.match(/`(.+?)`/);

      let firstMatch: { index: number; length: number; content: React.ReactNode } | null = null;

      if (boldMatch && boldMatch.index !== undefined) {
        const candidate = { index: boldMatch.index, length: boldMatch[0].length, content: <strong key={`b-${key++}`} className="font-semibold text-cm-text">{boldMatch[1]}</strong> };
        if (!firstMatch || candidate.index < (firstMatch as any).index) firstMatch = candidate;
      }

      if (codeMatch && codeMatch.index !== undefined) {
        const candidate = { index: codeMatch.index, length: codeMatch[0].length, content: <code key={`c-${key++}`} className="px-1.5 py-0.5 rounded-lg bg-cm-card-alt text-cm-amber text-xs font-mono">{codeMatch[1]}</code> };
        if (!firstMatch || candidate.index < (firstMatch as any).index) firstMatch = candidate;
      }

      if (!firstMatch) {
        parts.push(remaining);
        break;
      }

      if (firstMatch.index > 0) {
        parts.push(remaining.slice(0, firstMatch.index));
      }
      parts.push(firstMatch.content);
      remaining = remaining.slice(firstMatch.index + firstMatch.length);
    }

    return parts;
  };

  return (
    <div className="h-screen bg-cm-bg flex">
      {/* 会话历史侧栏 */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 240, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="hidden lg:flex h-screen flex-col border-r border-cm-border bg-cm-surface shrink-0 overflow-hidden"
          >
            <div className="flex items-center justify-between h-14 px-3 border-b border-cm-border-light">
              <span className="text-sm font-semibold text-cm-text">对话历史</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg text-cm-muted hover:bg-cm-card-alt hover:text-cm-text transition-colors"
                title="收起侧栏"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>

            <div className="p-2">
              <button
                onClick={handleNewSession}
                disabled={isStreaming}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium bg-cm-accent-light text-cm-accent hover:brightness-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={16} />
                新对话
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
              {sessions.length === 0 && (
                <div className="px-3 py-8 text-center text-xs text-cm-muted/70">
                  暂无对话记录
                </div>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => handleSelectSession(s.id)}
                  className={`group relative cursor-pointer rounded-xl px-3 py-2.5 transition-colors ${
                    s.id === currentSessionId
                      ? 'bg-cm-accent-light/60'
                      : 'hover:bg-cm-card-alt'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <MessageSquare
                      size={14}
                      className={`shrink-0 mt-0.5 ${s.id === currentSessionId ? 'text-cm-accent' : 'text-cm-muted'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${s.id === currentSessionId ? 'text-cm-accent' : 'text-cm-text'}`}>
                        {s.title || '新对话'}
                      </div>
                      <div className="text-[10px] text-cm-muted mt-0.5 flex items-center gap-2">
                        <span>{formatRelativeTime(s.updatedAt)}</span>
                        <span>·</span>
                        <span>{s.messages.length} 条</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(s.id);
                      }}
                      disabled={isStreaming}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-cm-muted hover:text-cm-red hover:bg-cm-card-alt transition-all disabled:opacity-30"
                      title="删除对话"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cm-border bg-cm-card sm:px-6">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg text-cm-muted hover:bg-cm-card-alt hover:text-cm-text transition-colors"
                title="展开对话历史"
              >
                <PanelLeftOpen size={18} />
              </button>
            )}
            <ModelSelector />
            <span className="hidden text-xs text-cm-muted sm:inline">
              {messages.length} 条消息
            </span>
          </div>
          <button
            onClick={handleNewSession}
            disabled={isStreaming}
            className="flex items-center gap-1.5 rounded-xl border border-cm-border bg-cm-card px-3 py-1.5 text-sm text-cm-muted transition-colors hover:border-cm-accent/50 hover:text-cm-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} />
            新对话
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* 头像 */}
                  <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden">
                    {isUser ? (
                      <div className="w-full h-full rounded-xl bg-cm-card-alt border border-cm-border flex items-center justify-center text-base">
                        🧑‍💻
                      </div>
                    ) : (
                      <img
                        src="/favicon.svg"
                        alt="AI"
                        className="w-full h-full rounded-xl object-contain bg-cm-card border border-cm-border"
                      />
                    )}
                  </div>
                  {/* 气泡 */}
                  <div
                    className={`max-w-[80%] sm:max-w-[75%] rounded-2xl px-4 py-3 sm:px-5 ${
                      isUser
                        ? 'bg-cm-accent-light rounded-br-sm'
                        : 'bg-cm-card shadow-soft rounded-bl-sm'
                    }`}
                  >
                    <div className="text-sm text-cm-text leading-relaxed whitespace-pre-wrap break-words">
                      {renderMessageContent(msg.content)}
                    </div>
                    <div className="text-xs text-cm-muted/60 mt-2">
                      {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* Streaming Indicator */}
            {isStreaming && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3 flex-row"
              >
                <div className="shrink-0 w-9 h-9 rounded-xl overflow-hidden">
                  <img
                    src="/favicon.svg"
                    alt="AI"
                    className="w-full h-full rounded-xl object-contain bg-cm-card border border-cm-border"
                  />
                </div>
                <div className="bg-cm-card shadow-soft rounded-2xl rounded-bl-sm px-5 py-3">
                  <div className="flex items-center gap-1.5">
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                      className="w-2 h-2 rounded-full bg-cm-accent"
                    />
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                      className="w-2 h-2 rounded-full bg-cm-accent"
                    />
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                      className="w-2 h-2 rounded-full bg-cm-accent"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-cm-border bg-cm-card px-4 py-3 sm:px-6 sm:py-4">
          <div className="max-w-3xl mx-auto">
            {/* Quick Actions - horizontal scroll on mobile */}
            <div className="flex items-center gap-2 mb-3 overflow-x-auto scrollbar-thin pb-1">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action.prompt)}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium bg-cm-card-alt text-cm-text-secondary transition-colors hover:bg-cm-accent-light hover:text-cm-accent"
                >
                  <action.icon size={12} />
                  {action.label}
                </button>
              ))}
            </div>

            {/* Input Row */}
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入你的问题，或粘贴代码让 AI 分析..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-cm-border bg-cm-card px-4 py-3 text-sm text-cm-text placeholder:text-cm-muted/50 outline-none focus:border-cm-accent/50 transition-colors"
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-cm-accent text-white flex items-center justify-center shadow-accent transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Side Editor Panel - Desktop only */}
      <AnimatePresence>
        {sidePanelCode && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 480, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="hidden lg:flex border-l border-cm-border bg-cm-card flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-cm-border">
              <span className="text-sm font-semibold text-cm-text">📝 代码编辑器</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSendFromEditor}
                  disabled={isStreaming}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium bg-cm-accent-light text-cm-accent hover:brightness-95 transition-colors disabled:opacity-50"
                >
                  <Send size={12} />
                  发送到对话
                </button>
                <button
                  onClick={() => setSidePanelCode('')}
                  className="text-cm-muted hover:text-cm-text transition-colors text-sm"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CodeRunner
                initialCode={sidePanelCode}
                language="python"
                height="100%"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CodeBlockMessage({
  code,
  language,
  onOpenInEditor,
}: {
  code: string;
  language: string;
  onOpenInEditor: (code: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-cm-border bg-cm-card-alt overflow-hidden my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-cm-card border-b border-cm-border">
        <span className="text-xs text-cm-muted font-mono">{language}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 rounded-lg hover:bg-cm-card-alt text-cm-muted hover:text-cm-text transition-colors"
            title="复制"
          >
            {copied ? <Check size={12} className="text-cm-green" /> : <Copy size={12} />}
          </button>
          <button
            onClick={() => onOpenInEditor(code)}
            className="p-1 rounded-lg hover:bg-cm-card-alt text-cm-muted hover:text-cm-text transition-colors"
            title="在编辑器打开"
          >
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
      <pre className="p-3 overflow-x-auto">
        <code className="text-xs leading-relaxed text-cm-text font-mono">{code}</code>
      </pre>
    </div>
  );
}

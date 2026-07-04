import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Plus,
  Code2,
  Wand2,
  Bug,
  TestTube2,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { useChatStore } from '@/stores/useChatStore';
import { createProvider } from '@/services/ai';
import { useSettingsStore } from '@/stores/useSettingsStore';
import ModelSelector from '@/components/common/ModelSelector';
import CodeEditor from '@/components/editor/CodeEditor';

const WELCOME_CONTENT = `你好！我是 CodeMentor AI 助手 🎓

我是你的专属编程导师，可以帮你：
• **解释代码** — 粘贴代码，我帮你逐行解读
• **优化代码** — 提升性能和可读性
• **Debug 帮助** — 快速定位和修复问题
• **生成测试** — 自动生成单元测试用例
• **学习指导** — 根据你的进度提供个性化建议

请先在设置中配置 AI 模型和 API Key，然后就可以开始对话了！`;

const quickActions = [
  { label: '解释代码', icon: Code2, prompt: '请解释以下代码的功能和工作原理：\n\n' },
  { label: '优化代码', icon: Wand2, prompt: '请优化以下代码，提高性能和可读性：\n\n' },
  { label: '生成测试', icon: TestTube2, prompt: '请为以下代码生成单元测试：\n\n' },
  { label: 'Debug 帮助', icon: Bug, prompt: '以下代码有问题，请帮我找出 bug 并修复：\n\n' },
];

export default function AIChat() {
  const { messages, isStreaming, addMessage, clearMessages, setStreaming } = useChatStore();
  const [input, setInput] = useState('');
  const [sidePanelCode, setSidePanelCode] = useState('');
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!initialized && messages.length === 0) {
      const activeModel = useSettingsStore.getState().getActiveModel();
      if (!activeModel) {
        addMessage({ role: 'assistant', content: WELCOME_CONTENT });
      }
      setInitialized(true);
    }
  }, [initialized, messages.length, addMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

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
      const systemMsg = { role: 'system' as const, content: '你是 CodeMentor AI，一位专业的编程导师助手。你的职责是：1. 帮助用户理解和解释代码；2. 提供编程建议和最佳实践；3. 帮助调试和修复代码问题；4. 生成代码示例和单元测试；5. 根据用户的学习进度提供个性化指导。请用中文回答，回答要简洁实用。' }
      const chatMessages = [systemMsg, ...useChatStore.getState().messages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content }))]
      chatMessages.push({ role: 'user', content: text });

      // Keep only last 20 messages for context window
      const recentMessages = chatMessages.slice(-20);

      console.log('[AIChat] 开始调用 AI...', { baseUrl: activeModel.baseUrl, model: activeModel.model });

      let fullResponse = '';

      // Add a placeholder message that we'll update
      addMessage({ role: 'assistant', content: '' });

      await provider.sendMessage(
        recentMessages,
        activeModel.apiKey,
        (chunk) => {
          fullResponse += chunk;
          // Update the last assistant message with streaming content
          useChatStore.setState((state) => ({
            messages: state.messages.map((m, i) =>
              i === state.messages.length - 1 ? { ...m, content: fullResponse } : m
            ),
          }));
        }
      );

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
      const systemMsg = { role: 'system' as const, content: '你是 CodeMentor AI，一位专业的编程导师助手。你的职责是：1. 帮助用户理解和解释代码；2. 提供编程建议和最佳实践；3. 帮助调试和修复代码问题；4. 生成代码示例和单元测试；5. 根据用户的学习进度提供个性化指导。请用中文回答，回答要简洁实用。' }
      const chatMessages = [systemMsg, ...useChatStore.getState().messages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content }))]
      chatMessages.push({ role: 'user', content: codeMessage });
      const recentMessages = chatMessages.slice(-20);

      let fullResponse = '';
      addMessage({ role: 'assistant', content: '' });

      await provider.sendMessage(
        recentMessages,
        activeModel.apiKey,
        (chunk) => {
          fullResponse += chunk;
          useChatStore.setState((state) => ({
            messages: state.messages.map((m, i) =>
              i === state.messages.length - 1 ? { ...m, content: fullResponse } : m
            ),
          }));
        }
      );

      setStreaming(false);
    } catch (err: any) {
      addMessage({ role: 'assistant', content: `请求失败：${err.message || '请检查模型配置'}` });
      setStreaming(false);
    }
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

      if (line.startsWith('```')) {
        if (inCodeBlock) {
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
          inCodeBlock = true;
          codeLang = line.slice(3).trim() || 'python';
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
        if (!firstMatch || candidate.index < firstMatch.index) firstMatch = candidate;
      }

      if (codeMatch && codeMatch.index !== undefined) {
        const candidate = { index: codeMatch.index, length: codeMatch[0].length, content: <code key={`c-${key++}`} className="px-1.5 py-0.5 rounded-lg bg-cm-card-alt text-cm-amber text-xs font-mono">{codeMatch[1]}</code> };
        if (!firstMatch || candidate.index < firstMatch.index) firstMatch = candidate;
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
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cm-border bg-cm-card sm:px-6">
          <div className="flex items-center gap-3">
            <ModelSelector />
            <span className="hidden text-xs text-cm-muted sm:inline">
              {messages.length} 条消息
            </span>
          </div>
          <button
            onClick={clearMessages}
            className="flex items-center gap-1.5 rounded-xl border border-cm-border bg-cm-card px-3 py-1.5 text-sm text-cm-muted transition-colors hover:border-cm-accent/50 hover:text-cm-accent"
          >
            <Plus size={16} />
            新对话
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 sm:px-5 ${
                    msg.role === 'user'
                      ? 'bg-cm-accent-light rounded-br-sm'
                      : 'bg-cm-card shadow-soft rounded-bl-sm'
                  }`}
                >
                  <div className="text-sm text-cm-text leading-relaxed whitespace-pre-wrap break-words">
                    {renderMessageContent(msg.content)}
                  </div>
                  <div className="text-xs text-cm-muted/60 mt-2">
                    {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Streaming Indicator */}
            {isStreaming && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
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
                  className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium bg-cm-accent-light text-cm-accent hover:brightness-95 transition-colors"
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
            <div className="flex-1">
              <CodeEditor
                initialValue={sidePanelCode}
                language="python"
                onChange={(value) => setSidePanelCode(value || '')}
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

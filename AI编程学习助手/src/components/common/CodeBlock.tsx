import { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/useSettingsStore';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  editable?: boolean;
}

export default function CodeBlock({
  code,
  language = 'javascript',
  title,
  editable = false,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { theme, editorFontSize } = useSettingsStore();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenInEditor = () => {
    window.dispatchEvent(
      new CustomEvent('open-in-editor', { detail: { code, language } })
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-cm-border bg-cm-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-cm-border bg-cm-card-alt px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-cm-accent/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-cm-amber/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-cm-green/60" />
          </div>
          {title && (
            <span className="ml-2 text-xs text-cm-muted">{title}</span>
          )}
          <span className="ml-2 rounded-md bg-cm-border-light px-1.5 py-0.5 text-[10px] text-cm-muted uppercase">
            {language}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-cm-muted hover:bg-cm-surface hover:text-cm-text transition-colors"
          >
            <Copy className="h-3 w-3" />
            {copied ? '已复制' : '复制'}
          </button>
          <button
            onClick={handleOpenInEditor}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-cm-muted hover:bg-cm-surface hover:text-cm-text transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            在编辑器中打开
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="h-64">
        <Editor
          height="100%"
          language={language}
          value={code}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          options={{
            readOnly: !editable,
            minimap: { enabled: false },
            fontSize: editorFontSize,
            lineHeight: Math.round(editorFontSize * 1.5),
            fontFamily: "'JetBrains Mono', monospace",
            scrollBeyondLastLine: false,
            folding: false,
            lineNumbers: 'on',
            renderLineHighlight: 'none',
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: {
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
            },
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>
    </div>
  );
}

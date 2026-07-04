import { useRef, useCallback, useEffect, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/useSettingsStore';

interface CodeEditorProps {
  initialValue?: string;
  language?: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
  height?: string;
}

function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

export default function CodeEditor({
  initialValue = '',
  language = 'javascript',
  onChange,
  readOnly = false,
  height = '400px',
}: CodeEditorProps) {
  const editorRef = useRef<any>(null);
  // 标记是否正在从外部同步内容，防止 onChange → setCode → initialValue → setValue → onChange 循环
  const isSyncingRef = useRef(false);
  const { theme, editorFontSize } = useSettingsStore();
  const [touchDevice] = useState(() => isTouchDevice());
  // 移动端 textarea 内部状态
  const [mobileValue, setMobileValue] = useState(initialValue);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    monaco.editor.defineTheme('codementor-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '9C8E7C' },
        { token: 'keyword', foreground: '7B6BA5' },
        { token: 'string', foreground: '5B8C5A' },
        { token: 'number', foreground: 'C4703F' },
        { token: 'type', foreground: '5B7EA8' },
      ],
      colors: {
        'editor.background': '#FAF7F2',
        'editor.foreground': '#2D2418',
        'editor.lineHighlightBackground': '#F5F0E8',
        'editor.selectionBackground': '#F0DDD0',
        'editorCursor.foreground': '#C4703F',
        'editorLineNumber.foreground': '#9C8E7C',
        'editorLineNumber.activeForeground': '#6B5D4D',
        'editor.inactiveSelectionBackground': '#F5F0E850',
        'editorIndentGuide.background': '#F0EBE3',
        'editorIndentGuide.activeBackground': '#E8E0D4',
      },
    });

    monaco.editor.defineTheme('codementor-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6B6B80' },
        { token: 'keyword', foreground: 'A78BFA' },
        { token: 'string', foreground: '6EE7B7' },
        { token: 'number', foreground: 'F59E0B' },
        { token: 'type', foreground: '67E8F9' },
      ],
      colors: {
        'editor.background': '#1A1A2E',
        'editor.foreground': '#E8E8E8',
        'editor.lineHighlightBackground': '#16213E',
        'editor.selectionBackground': '#2A2A4A',
        'editorCursor.foreground': '#C4703F',
        'editorLineNumber.foreground': '#6B6B80',
        'editorLineNumber.activeForeground': '#A0A0B0',
        'editor.inactiveSelectionBackground': '#16213E50',
        'editorIndentGuide.background': '#1E1E3A',
        'editorIndentGuide.activeBackground': '#2A2A4A',
      },
    });

    monaco.editor.setTheme(theme === 'dark' ? 'codementor-dark' : 'codementor-light');

    const resizeObserver = new ResizeObserver(() => {
      editor.layout();
    });
    resizeObserver.observe(editor.getDomNode()!);

    const node = editor.getDomNode()!;
    return () => {
      resizeObserver.unobserve(node);
      resizeObserver.disconnect();
    };
  }, []);

  // 包装 onChange，跳过外部同步触发的变更
  const handleChange = useCallback((value: string | undefined) => {
    if (isSyncingRef.current) return; // 外部同步触发的变更，不回调
    onChange?.(value);
  }, [onChange]);

  // 响应主题变化
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const monaco = (window as any).monaco;
    if (!monaco) return;
    monaco.editor.setTheme(theme === 'dark' ? 'codementor-dark' : 'codementor-light');
  }, [theme]);

  // 响应字体大小变化
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({ fontSize: editorFontSize });
  }, [editorFontSize]);

  // 当 initialValue 外部更新时，同步到编辑器（不触发 onChange 回调）
  useEffect(() => {
    if (touchDevice) {
      setMobileValue(initialValue);
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    const currentValue = editor.getValue();
    if (currentValue !== initialValue) {
      isSyncingRef.current = true;
      const model = editor.getModel();
      const position = editor.getPosition();
      editor.executeEdits('external-sync', [{
        range: model!.getFullModelRange(),
        text: initialValue,
      }]);
      if (position) {
        editor.setPosition(position);
      }
      // 延迟重置标记，确保 onChange 回调已跳过
      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    }
  }, [initialValue, touchDevice]);

  // 移动端/触摸设备降级为轻量 textarea，避免 Monaco 加载失败且更适合手机输入
  if (touchDevice) {
    return (
      <div
        className={cn(
          'h-full overflow-hidden rounded-xl border border-cm-border',
          theme === 'dark' ? 'bg-[#1A1A2E]' : 'bg-[#FAF7F2]'
        )}
        style={{ height }}
      >
        <textarea
          value={mobileValue}
          onChange={(e) => {
            setMobileValue(e.target.value);
            handleChange(e.target.value);
          }}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className={cn(
            'h-full w-full resize-none p-4 font-mono text-sm outline-none',
            theme === 'dark' ? 'text-[#E8E8E8]' : 'text-[#2D2418]'
          )}
          style={{ fontSize: editorFontSize, lineHeight: `${Math.round(editorFontSize * 1.6)}px` }}
        />
      </div>
    );
  }

  return (
    <div className={cn('h-full overflow-hidden rounded-xl border border-cm-border')}>
      <Editor
        height={height}
        language={language}
        defaultValue={initialValue}
        onChange={handleChange}
        onMount={handleMount}
        theme={theme === 'dark' ? 'codementor-dark' : 'codementor-light'}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: editorFontSize,
          lineHeight: Math.round(editorFontSize * 1.6),
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          renderLineHighlight: 'all',
          bracketPairColorization: { enabled: true },
          automaticLayout: true,
          padding: { top: 16, bottom: 16 },
          scrollbar: {
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6,
          },
        }}
      />
    </div>
  );
}

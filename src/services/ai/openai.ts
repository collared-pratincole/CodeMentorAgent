/**
 * 通用 OpenAI 兼容提供者
 * 通过传入不同的 baseUrl 支持所有兼容 OpenAI 接口的服务
 *
 * 安全改动：不再接收 apiKey 参数，改传 { userId, modelId }
 * 后端 /api/ai/chat 用此查存储的明文 key
 */

import { AIProvider, type ChatMessage, type AIModelConfig, type SendMessageOptions, type AIAuth } from './base'

export class OpenAIProvider extends AIProvider {
  config: AIModelConfig
  private baseUrl: string

  constructor(modelId: string = 'gpt-4o', baseUrl: string = 'https://api.openai.com/v1') {
    super()
    this.baseUrl = baseUrl
    this.config = {
      id: modelId,
      name: modelId,
      provider: 'openai-compatible',
      icon: '🤖',
      description: `OpenAI 兼容接口 (${baseUrl})`,
      maxTokens: 128000,
      supportsStreaming: true,
    }
  }

  async sendMessage(
    messages: ChatMessage[],
    auth: AIAuth,
    onChunk: (chunk: string) => void,
    options?: SendMessageOptions
  ): Promise<string> {
    // 通过后端代理调用 AI，避免浏览器 CORS 问题
    // I6 修复：加 idle 超时保护。AI 上游长时间无响应时 fetch 会永久挂起，
    // 用 AbortController + idle 计时：每收到一个 chunk 重置计时器，
    // 总空闲超过 90 秒则中止请求（GLM 思考阶段可能 1-2 分钟无 chunk，故宽松些）
    const IDLE_TIMEOUT_MS = 90_000
    const controller = new AbortController()
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        try { controller.abort() } catch {}
      }, IDLE_TIMEOUT_MS)
    }
    resetIdleTimer()

    let response: Response
    try {
      response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: auth.userId,
          modelId: auth.modelId,
          baseUrl: this.baseUrl,
          model: this.config.id,
          messages: messages.map(({ role, content }) => ({ role, content })),
          stream: true,
          ...(options?.maxTokens != null ? { maxTokens: options.maxTokens } : {}),
          ...(options?.temperature != null ? { temperature: options.temperature } : {}),
        }),
        signal: controller.signal,
      })
    } catch (err: any) {
      if (idleTimer) clearTimeout(idleTimer)
      if (err?.name === 'AbortError') {
        throw new Error('AI 请求超时（90 秒无响应），请检查模型或网络后重试')
      }
      throw err
    }

    if (!response.ok) {
      if (idleTimer) clearTimeout(idleTimer)
      let errMsg = `API 请求失败: ${response.status}`
      try {
        const errBody = await response.json()
        if (errBody?.error) errMsg = String(errBody.error)
      } catch {
        try {
          const text = await response.text()
          if (text) errMsg += ` - ${text.slice(0, 200)}`
        } catch {}
      }
      throw new Error(errMsg)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''
    let buffer = ''
    // 诊断计数器：用于在空内容时输出更准确的失败原因
    let sseLineCount = 0
    let reasoningChunkCount = 0
    let contentChunkCount = 0
    let firstChunkAt: number | null = null
    // 后端代理转发的上游错误事件：用标志变量在外层抛出，避免被内层 try/catch 吞掉
    let upstreamError: string | null = null

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // 收到数据，重置 idle 计时器
        resetIdleTimer()

        buffer += decoder.decode(value, { stream: true })
        // 按换行分割，最后一段可能不完整，留在缓冲区
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trimStart()
          if (data === '[DONE]') continue

          sseLineCount++
          if (firstChunkAt === null) firstChunkAt = Date.now()

          try {
            const parsed = JSON.parse(data)

            // 上游错误事件（部分模型在 SSE 中嵌入 error 字段，或后端代理转发上游空响应错误）
            if (parsed.error) {
              const errMsg = String(parsed.error).slice(0, 200)
              console.warn('[AI Provider] 上游 SSE 返回 error 字段:', errMsg)
              // 后端代理转发的明确错误事件：记录后跳出循环，在外层抛出
              if (parsed.error === 'upstream_empty_response' || parsed.error === 'upstream_stream_interrupted') {
                upstreamError = `上游 SSE 错误: ${parsed.error}`
                break
              }
              continue
            }

            const delta = parsed.choices?.[0]?.delta
            if (!delta) continue

            // 主内容
            const content = delta.content
            if (content) {
              fullContent += content
              onChunk(content)
              contentChunkCount++
            }

            // GLM/DeepSeek 等模型的思考阶段字段：reasoning_content / reasoning / thinking
            // 思考期间 content 为空，但上游仍在工作，不能算空响应
            // 这里不计入 fullContent，只用于诊断
            const reasoning = delta.reasoning_content || delta.reasoning || delta.thinking
            if (reasoning) {
              reasoningChunkCount++
            }
          } catch (e) {
            console.warn('[AI Provider] SSE 行解析失败:', (e as Error).message?.slice(0, 80), '| data:', data.slice(0, 100))
          }
        }

        // 上游错误事件：跳出外层 while 循环
        if (upstreamError) break
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // 超时时如果已经收到部分内容，返回部分内容（让上层决定是否使用）
        // 否则抛出明确错误
        if (fullContent) {
          console.warn('[AI Provider] AI 请求空闲超时，但已收到部分内容（可能被截断）:', fullContent.length, '字符')
          return fullContent
        }
        throw new Error('AI 请求空闲超时（90 秒无响应），未收到任何内容')
      }
      throw err
    } finally {
      if (idleTimer) clearTimeout(idleTimer)
    }

    // 上游明确错误：抛出，让上层重试机制处理
    if (upstreamError) {
      throw new Error(upstreamError)
    }

    // 处理缓冲区中剩余的最后一行
    const remaining = buffer.trim()
    if (remaining.startsWith('data:')) {
      const data = remaining.slice(5).trimStart()
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullContent += content
            onChunk(content)
            contentChunkCount++
          }
        } catch (e) {
          console.warn('[AI Provider] SSE 残留行解析失败:', (e as Error).message?.slice(0, 80))
        }
      }
    }

    // 空内容诊断：详细记录失败原因，方便排查
    if (!fullContent) {
      const durationMs = firstChunkAt ? Date.now() - firstChunkAt : 0
      const diagnosis = {
        sseLineCount,
        reasoningChunkCount,
        contentChunkCount,
        durationMs,
        model: this.config.id,
      }
      if (reasoningChunkCount > 0) {
        console.warn('[AI Provider] AI 仅输出思考内容未输出最终答案（可能被 max_tokens 截断在思考阶段）:', diagnosis)
      } else if (sseLineCount === 0) {
        console.warn('[AI Provider] 上游未返回任何 SSE 数据行（可能上游 200 但响应体为空）:', diagnosis)
      } else {
        console.warn('[AI Provider] 收到 SSE 数据但 content 全为空:', diagnosis)
      }
    }

    return fullContent
  }

  async testConnection(auth: AIAuth): Promise<boolean> {
    try {
      // 通过后端代理测试连接（apiKey 由后端查存储）
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: auth.userId,
          modelId: auth.modelId,
          baseUrl: this.baseUrl,
          model: this.config.id,
          messages: [{ role: 'user', content: 'Hi' }],
          stream: false,
          maxTokens: 5,
        }),
      })
      return response.ok
    } catch {
      return false
    }
  }
}

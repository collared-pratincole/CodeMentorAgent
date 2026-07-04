/**
 * 通用 OpenAI 兼容提供者
 * 通过传入不同的 baseUrl 支持所有兼容 OpenAI 接口的服务
 */

import { AIProvider, type ChatMessage, type AIModelConfig } from './base'

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
    apiKey: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.id,
        messages: messages.map(({ role, content }) => ({ role, content })),
        stream: true,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API 请求失败: ${response.status} - ${error}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter((line) => line.startsWith('data: '))

      for (const line of lines) {
        const data = line.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullContent += content
            onChunk(content)
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    return fullContent
  }

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      // 尝试发送一个最简请求来验证连接
      const url = `${this.baseUrl}/chat/completions`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.id,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
          stream: false,
        }),
      })
      return response.ok
    } catch {
      return false
    }
  }
}

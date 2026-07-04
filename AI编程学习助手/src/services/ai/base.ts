/**
 * AI 提供者基础接口和抽象类
 * 定义所有 AI 模型提供者需要实现的统一接口
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AIModelConfig {
  id: string
  name: string
  provider: string
  icon: string
  description: string
  maxTokens: number
  supportsStreaming: boolean
}

export abstract class AIProvider {
  abstract config: AIModelConfig
  abstract sendMessage(
    messages: ChatMessage[],
    apiKey: string,
    onChunk: (chunk: string) => void
  ): Promise<string>
  abstract testConnection(apiKey: string): Promise<boolean>
}

/**
 * AI 提供者基础接口和抽象类
 * 定义所有 AI 模型提供者需要实现的统一接口
 *
 * 安全改动：sendMessage / testConnection 不再接收 apiKey 参数
 * apiKey 存后端，前端只传 userId + modelId，后端查存储的明文 key 调上游
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

export interface SendMessageOptions {
  // 显式指定 max_tokens，覆盖后端默认值（用于需要长输出的场景如项目构建步骤生成）
  maxTokens?: number
  // 温度参数
  temperature?: number
}

// 调用 AI 所需的身份信息：后端用此查存储的 apiKey
export interface AIAuth {
  userId: string
  modelId: string
}

export abstract class AIProvider {
  abstract config: AIModelConfig
  abstract sendMessage(
    messages: ChatMessage[],
    auth: AIAuth,
    onChunk: (chunk: string) => void,
    options?: SendMessageOptions
  ): Promise<string>
  abstract testConnection(auth: AIAuth): Promise<boolean>
}

/**
 * AI 服务统一入口
 * 所有提供商均使用 OpenAI 兼容接口
 *
 * 安全改动：testConnection 不再接收 apiKey 参数，改传 { userId, modelId }
 */

export { type ChatMessage, type AIModelConfig, type AIAuth } from './base'
export { OpenAIProvider } from './openai'

import { OpenAIProvider } from './openai'
import type { AIProvider, AIAuth } from './base'

/**
 * 创建 AI 提供者实例
 * 所有提供商统一使用 OpenAI 兼容接口，只需不同的 baseUrl
 */
export function createProvider(baseUrl: string, model: string): AIProvider {
  return new OpenAIProvider(model, baseUrl)
}

/**
 * 测试 API 连接（apiKey 由后端查存储）
 */
export async function testConnection(
  baseUrl: string,
  model: string,
  auth: AIAuth
): Promise<boolean> {
  try {
    const provider = new OpenAIProvider(model, baseUrl)
    return await provider.testConnection(auth)
  } catch {
    return false
  }
}

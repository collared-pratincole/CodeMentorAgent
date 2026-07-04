/**
 * AI 服务统一入口
 * 所有提供商均使用 OpenAI 兼容接口
 */

export { type ChatMessage, type AIModelConfig } from './base'
export { OpenAIProvider } from './openai'

import { OpenAIProvider } from './openai'
import type { AIProvider } from './base'

/**
 * 创建 AI 提供者实例
 * 所有提供商统一使用 OpenAI 兼容接口，只需不同的 baseUrl
 */
export function createProvider(baseUrl: string, model: string): AIProvider {
  return new OpenAIProvider(model, baseUrl)
}

/**
 * 测试 API 连接
 */
export async function testConnection(
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<boolean> {
  try {
    const provider = new OpenAIProvider(model, baseUrl)
    return await provider.testConnection(apiKey)
  } catch {
    return false
  }
}

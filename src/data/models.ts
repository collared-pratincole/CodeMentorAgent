/**
 * AI 提供商配置
 * 图标使用本地 SVG 文件 (public/icons/providers/)
 */

export interface ProviderConfig {
  id: string
  name: string
  /** 本地 SVG 图标路径 */
  iconUrl: string
  baseUrl: string
  defaultModel: string
  color: string
  description: string
}

function iconUrl(id: string): string {
  return `/icons/providers/${id}.svg`
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    iconUrl: iconUrl('openai'),
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    color: '#10B981',
    description: 'GPT-4o / GPT-4o Mini / GPT-3.5 等',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    iconUrl: iconUrl('anthropic'),
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
    color: '#7B6BA5',
    description: 'Claude 4 Sonnet / Claude 3.5 等',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    iconUrl: iconUrl('deepseek'),
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    color: '#5B7EA8',
    description: 'DeepSeek-V3 / DeepSeek-R1 等',
  },
  {
    id: 'qwen',
    name: '阿里云 · 通义千问',
    iconUrl: iconUrl('qwen'),
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-max',
    color: '#C49A3F',
    description: 'qwen-max / qwen-plus / qwen-turbo 等',
  },
  {
    id: 'wenxin',
    name: '百度 · 文心一言',
    iconUrl: iconUrl('wenxin'),
    baseUrl: 'https://qianfan.baidubce.com/v2',
    defaultModel: 'ernie-4.0-8k',
    color: '#3B82F6',
    description: 'ernie-4.0-8k / ernie-3.5-8k 等',
  },
  {
    id: 'zhipu',
    name: '智谱AI · GLM',
    iconUrl: iconUrl('zhipu'),
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4',
    color: '#8B5CF6',
    description: 'glm-4 / glm-4-flash / glm-4-plus 等',
  },
  {
    id: 'moonshot',
    name: '月之暗面 · Kimi',
    iconUrl: iconUrl('moonshot'),
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    color: '#C4703F',
    description: 'moonshot-v1-8k / moonshot-v1-32k 等',
  },
  {
    id: 'yi',
    name: '零一万物 · Yi',
    iconUrl: iconUrl('yi'),
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    defaultModel: 'yi-large',
    color: '#5B8C5A',
    description: 'yi-large / yi-medium / yi-spark 等',
  },
  {
    id: 'doubao',
    name: '字节跳动 · 豆包',
    iconUrl: iconUrl('doubao'),
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-4k',
    color: '#C45B5B',
    description: 'doubao-pro / doubao-lite 等',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    iconUrl: iconUrl('siliconflow'),
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    color: '#6B5D4D',
    description: '多种开源模型托管平台',
  },
  {
    id: 'ollama',
    name: 'Ollama (本地)',
    iconUrl: iconUrl('ollama'),
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3',
    color: '#9C8E7C',
    description: '本地运行的开源模型',
  },
  {
    id: 'google',
    name: 'Google · Gemini',
    iconUrl: iconUrl('google'),
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    color: '#4285F4',
    description: 'gemini-2.0-flash / gemini-1.5-pro 等',
  },
  {
    id: 'groq',
    name: 'Groq',
    iconUrl: iconUrl('groq'),
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    color: '#F55036',
    description: '超快推理速度的 LLM 服务',
  },
  {
    id: 'custom',
    name: '自定义提供商',
    iconUrl: iconUrl('custom'),
    baseUrl: '',
    defaultModel: '',
    color: '#6B5D4D',
    description: '兼容 OpenAI 接口的任意服务',
  },
]

/**
 * 用户配置的模型实例
 *
 * 安全改动：apiKey 不再存到前端（localStorage/内存），改存后端
 * - hasApiKey: 是否已配置 apiKey（用于 UI 显示状态）
 * - apiKeyPreview: 脱敏预览（如 sk-***...1234），从后端拉取，非明文
 * 调用 AI 时前端只传 modelId，后端查存储的明文 key
 */
export interface UserModel {
  id: string
  providerId: string
  baseUrl: string
  model: string
  label: string
  // 是否已在该用户后端存储中配置 apiKey
  hasApiKey?: boolean
  // 脱敏预览（后端返回），如 "sk-***...1234"
  apiKeyPreview?: string
}

export function makeModelId(providerId: string, model: string): string {
  return `${providerId}::${model}`
}

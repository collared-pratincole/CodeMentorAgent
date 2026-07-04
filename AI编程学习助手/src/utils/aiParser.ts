/**
 * AI 响应 JSON 解析器
 * 从 AI 的原始文本输出中提取标准 JSON
 */

/**
 * 从 AI 原始文本中提取 JSON
 * 处理以下常见情况：
 * 1. 纯 JSON 字符串
 * 2. 被 ```json ... ``` 包裹的 JSON
 * 3. JSON 前后有额外文字
 * 4. 多个 JSON 块（取最大的一个）
 */
export function extractJSON(raw: string): string | null {
  // 1. 尝试提取 ```json ... ``` 代码块
  const codeBlockMatch = raw.match(/```json\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // 2. 尝试提取 ``` ... ``` 代码块（无语言标记）
  const genericBlockMatch = raw.match(/```\s*\n?([\s\S]*?)\n?\s*```/)
  if (genericBlockMatch) {
    const content = genericBlockMatch[1].trim()
    if (content.startsWith('{') || content.startsWith('[')) {
      return content
    }
  }

  // 3. 使用括号平衡法提取最外层 { ... }
  //    比贪婪正则更可靠，能正确处理嵌套结构和字符串内的花括号
  const jsonStr = extractBalancedJSON(raw)
  if (jsonStr) {
    return jsonStr
  }

  return null
}

/**
 * 使用括号平衡法提取完整的 JSON 对象
 * 正确处理字符串内的花括号和转义字符
 */
function extractBalancedJSON(raw: string): string | null {
  // 找到第一个 { 的位置
  const startIdx = raw.indexOf('{')
  if (startIdx === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = startIdx; i < raw.length; i++) {
    const ch = raw[i]

    if (escape) {
      escape = false
      continue
    }

    if (ch === '\\' && inString) {
      escape = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === '{' || ch === '[') {
      depth++
    } else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) {
        return raw.substring(startIdx, i + 1)
      }
    }
  }

  // 如果括号不平衡，返回从第一个 { 到末尾的内容
  // 这可能是不完整的 JSON，但 repairJSON 会尝试修复
  if (depth > 0) {
    const candidate = raw.substring(startIdx)
    // 尝试找到最后一个 } 的位置
    const lastBrace = candidate.lastIndexOf('}')
    if (lastBrace > 0) {
      return candidate.substring(0, lastBrace + 1)
    }
  }

  return null
}

/**
 * 安全解析 AI 返回的 JSON
 * @param raw AI 原始文本
 * @param fallback 解析失败时的降级值
 * @returns 解析后的对象或降级值
 */
export function parseAIResponse<T>(raw: string, fallback: T): T {
  const jsonStr = extractJSON(raw)
  if (!jsonStr) {
    console.warn('[AI Parser] 未找到 JSON 内容', raw.slice(0, 200))
    return fallback
  }

  try {
    return JSON.parse(jsonStr) as T
  } catch (err) {
    console.warn('[AI Parser] JSON 解析失败', err, jsonStr.slice(0, 200))
    return fallback
  }
}

/**
 * 修复常见的 AI JSON 输出问题
 */
export function repairJSON(str: string): string {
  let repaired = str

  // 移除尾部逗号 (trailing commas)
  repaired = repaired.replace(/,\s*([}\]])/g, '$1')

  // 修复中文标点（AI 有时会输出中文引号）
  repaired = repaired.replace(/[\u201c\u201d]/g, '"')  // 中文双引号
  repaired = repaired.replace(/[\u2018\u2019]/g, "'")  // 中文单引号
  repaired = repaired.replace(/\u3001/g, ',')           // 顿号 → 逗号
  repaired = repaired.replace(/\uff0c/g, ',')           // 全角逗号 → 半角逗号
  repaired = repaired.replace(/\uff1a/g, ':')           // 全角冒号 → 半角冒号

  // 修复未闭合的字符串（截断的 JSON）
  // 找到最后一个完整的键值对，截断后面的内容
  const lastCompleteValue = repaired.lastIndexOf('",')
  if (lastCompleteValue > 0) {
    // 检查是否真的不完整
    try {
      JSON.parse(repaired)
      return repaired  // 其实是完整的
    } catch {
      // 确实不完整，尝试截断修复
      const truncated = repaired.substring(0, lastCompleteValue + 2)
      // 尝试补全缺失的闭合括号
      const openBraces = (truncated.match(/\{/g) || []).length
      const closeBraces = (truncated.match(/\}/g) || []).length
      const openBrackets = (truncated.match(/\[/g) || []).length
      const closeBrackets = (truncated.match(/\]/g) || []).length
      let result = truncated
      // 移除尾部逗号
      result = result.replace(/,\s*$/, '')
      // 补全缺失的括号
      for (let i = 0; i < openBrackets - closeBrackets; i++) result += ']'
      for (let i = 0; i < openBraces - closeBraces; i++) result += '}'
      return result
    }
  }

  return repaired
}

/**
 * 增强版解析：先尝试直接解析，失败后修复再试
 * 当 raw 为空或无法提取 JSON 时抛出错误，而不是静默返回 fallback
 */
export function parseAIResponseRobust<T>(raw: string, fallback: T): T {
  if (!raw || !raw.trim()) {
    throw new Error('AI 返回内容为空，请检查模型配置或重试')
  }

  const jsonStr = extractJSON(raw)
  if (!jsonStr) {
    throw new Error('AI 返回内容中未找到有效 JSON，请重试')
  }

  // 第一次尝试：直接解析
  try {
    return JSON.parse(jsonStr) as T
  } catch (e) {
    console.warn('[AI Parser] 直接解析失败，尝试修复...', (e as Error).message?.slice(0, 100))
  }

  // 第二次尝试：修复后解析
  try {
    const repaired = repairJSON(jsonStr)
    return JSON.parse(repaired) as T
  } catch (e) {
    console.warn('[AI Parser] 修复后解析失败，尝试截断修复...', (e as Error).message?.slice(0, 100))
  }

  // 第三次尝试：更激进的截断修复
  try {
    const aggressivelyRepaired = aggressiveRepair(jsonStr)
    return JSON.parse(aggressivelyRepaired) as T
  } catch (e) {
    console.error('[AI Parser] 所有修复尝试均失败', jsonStr.slice(0, 300))
  }

  throw new Error('AI 返回的 JSON 格式无法解析，请重试')
}

/**
 * 激进修复：截断到最后一个完整的值，补全括号
 */
function aggressiveRepair(str: string): string {
  // 尝试找到最后一个完整的字符串值（以 " 结尾，前面不是 \）
  let lastValidEnd = -1
  for (let i = str.length - 1; i >= 0; i--) {
    if (str[i] === '"' && (i === 0 || str[i - 1] !== '\\')) {
      lastValidEnd = i + 1
      break
    }
  }

  if (lastValidEnd > 0) {
    let truncated = str.substring(0, lastValidEnd)
    // 移除尾部不完整的键值对（如 "key": "value 后面没有闭合引号）
    // 找到最后一个完整的键值对结束位置
    const lastCompletePair = Math.max(
      truncated.lastIndexOf('",'),
      truncated.lastIndexOf('",\n'),
      truncated.lastIndexOf('"}')
    )

    if (lastCompletePair > 0) {
      truncated = truncated.substring(0, lastCompletePair + 2)
    }

    // 移除尾部逗号
    truncated = truncated.replace(/,\s*$/, '')

    // 补全缺失的括号
    const openBraces = (truncated.match(/\{/g) || []).length
    const closeBraces = (truncated.match(/\}/g) || []).length
    const openBrackets = (truncated.match(/\[/g) || []).length
    const closeBrackets = (truncated.match(/\]/g) || []).length

    for (let i = 0; i < openBrackets - closeBrackets; i++) truncated += ']'
    for (let i = 0; i < openBraces - closeBraces; i++) truncated += '}'

    return truncated
  }

  return str
}

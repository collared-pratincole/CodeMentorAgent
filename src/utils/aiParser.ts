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
 * 4. 多个 JSON 块（取最完整、最大的一个）
 * 5. 单引号包裹的伪 JSON
 */
export function extractJSON(raw: string): string | null {
  if (!raw) return null

  // 1. 尝试提取 ```json ... ``` 代码块（允许任意空白）
  const jsonBlockMatch = raw.match(/```(?:json)\s*\n?([\s\S]*?)\n?\s*```/i)
  if (jsonBlockMatch) {
    const content = jsonBlockMatch[1].trim()
    if (looksLikeJSON(content)) return content
  }

  // 2. 尝试提取 ``` ... ``` 代码块（无语言标记）
  const genericBlockMatch = raw.match(/```\s*\n?([\s\S]*?)\n?\s*```/)
  if (genericBlockMatch) {
    const content = genericBlockMatch[1].trim()
    if (looksLikeJSON(content)) return content
  }

  // 3. 使用括号平衡法提取最外层 { ... }
  //    比贪婪正则更可靠，能正确处理嵌套结构和字符串内的花括号
  const balanced = extractBalancedJSON(raw)
  if (balanced) {
    // 校验提取的内容确实是合法 JSON，避免前置文本中花括号的干扰
    try {
      JSON.parse(balanced)
      return balanced
    } catch {
      // 不是合法 JSON，继续尝试其他方法
    }
  }

  // 4. 兜底：尝试用正则找出所有看起来像 JSON 的片段，选最长的一个
  const candidates = findJSONCandidates(raw)
  for (const candidate of candidates) {
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      // 继续尝试下一个候选
    }
  }

  // 5. 最后兜底：返回最长的候选（可能不完整，交给 repairJSON 修复）
  if (candidates.length > 0) {
    return candidates[0]
  }

  // 6. 如果 balanced 存在但 parse 失败，仍返回它（交给 repairJSON 修复）
  if (balanced) {
    return balanced
  }

  return null
}

function looksLikeJSON(str: string): boolean {
  if (!str) return false
  const s = str.trim()
  return s.startsWith('{') || s.startsWith('[') || /^\s*"/.test(s)
}

/**
 * 找出所有候选 JSON 片段，按长度降序返回
 */
function findJSONCandidates(raw: string): string[] {
  const results: string[] = []
  // 匹配从 { 或 [ 开始，到对应的 } 或 ] 结束的最长片段
  const regex = /[{\[]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(raw)) !== null) {
    const start = match.index
    const end = findMatchingClose(raw, start)
    if (end > start) {
      results.push(raw.substring(start, end + 1))
    }
  }
  return results.sort((a, b) => b.length - a.length)
}

/**
 * 找到与 start 位置括号匹配的闭合位置
 */
function findMatchingClose(raw: string, start: number): number {
  const open = raw[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < raw.length; i++) {
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
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * 使用括号平衡法提取完整的 JSON 对象
 * 正确处理字符串内的花括号和转义字符
 */
function extractBalancedJSON(raw: string): string | null {
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

  // 如果括号不平衡，尝试截断到最后一个完整的 }
  if (depth > 0) {
    const candidate = raw.substring(startIdx)
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
 * 使用状态机避免破坏 JSON 字符串内部内容
 */
export function repairJSON(str: string): string {
  let repaired = safeRepair(str)

  // 修复未闭合的字符串（截断的 JSON）
  const lastCompleteValue = repaired.lastIndexOf('",')
  if (lastCompleteValue > 0) {
    try {
      JSON.parse(repaired)
      return repaired
    } catch {
      const truncated = repaired.substring(0, lastCompleteValue + 2)
      let result = truncated.replace(/,\s*$/, '')
      const openBraces = (result.match(/\{/g) || []).length
      const closeBraces = (result.match(/\}/g) || []).length
      const openBrackets = (result.match(/\[/g) || []).length
      const closeBrackets = (result.match(/\]/g) || []).length
      for (let i = 0; i < openBrackets - closeBrackets; i++) result += ']'
      for (let i = 0; i < openBraces - closeBraces; i++) result += '}'
      return result
    }
  }

  return repaired
}

/**
 * 安全修复：只在 JSON 字符串外部进行替换，避免破坏字符串内容
 *
 * 关键修复：处理 JSON 字符串内的非法转义字符
 * JSON 标准只允许 \" \\ \/ \b \f \n \r \t \uXXXX
 * AI 输出中常见非法转义：正则字符 \d \w \.、Windows 路径 \U \P、Markdown \* \_
 * 这些非法转义会让 JSON.parse 报 "Bad escaped character"
 * 修复策略：把裸反斜杠 \ 转义为双反斜杠 \\，让 JSON.parse 把它当作字面反斜杠
 */
function safeRepair(str: string): string {
  let result = ''
  let i = 0
  let inString = false
  let stringChar = ''
  let escape = false

  // JSON 合法转义字符（\ 后跟这些字符是合法的）
  const JSON_VALID_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'])

  while (i < str.length) {
    const ch = str[i]

    if (escape) {
      // 检查 \ 后的字符是否为 JSON 合法转义
      // \u 需要 4 个十六进制字符，简单放过 u 让 JSON.parse 校验
      if (JSON_VALID_ESCAPES.has(ch)) {
        // 合法转义：原样保留
        result += ch
      } else {
        // 非法转义：把 \ 改成 \\（前面已写入 \，这里补一个 \），然后原样保留字符
        result += '\\'
        result += ch
      }
      escape = false
      i++
      continue
    }

    if (ch === '\\' && inString) {
      result += ch
      escape = true
      i++
      continue
    }

    if (!inString) {
      // 字符串外部：跳过注释
      if (ch === '/' && str[i + 1] === '/') {
        while (i < str.length && str[i] !== '\n') i++
        continue
      }
      if (ch === '/' && str[i + 1] === '*') {
        i += 2
        while (i < str.length - 1 && !(str[i] === '*' && str[i + 1] === '/')) i++
        i += 2
        continue
      }

      // 字符串外部：开始字符串（支持单引号、中文引号）
      if (ch === '"' || ch === "'" || ch === '“' || ch === '”' || ch === '‘' || ch === '’') {
        inString = true
        stringChar = ch
        result += '"'
        i++
        continue
      }

      // 字符串外部：移除尾部逗号（仅当逗号后紧跟空白和 } 或 ] 时）
      if (ch === ',' && /^\s*[}\]]/.test(str.slice(i + 1))) {
        i++
        while (i < str.length && /\s/.test(str[i])) i++
        result += str[i]  // 添加 } 或 ]
        i++
        continue
      }

      // 字符串外部：中文标点修复
      if (ch === '、' || ch === '，') { result += ','; i++; continue }
      if (ch === '：') { result += ':'; i++; continue }

      result += ch
      i++
      continue
    }

    // 字符串内部：检测字符串结束
    if (
      (stringChar === '"' && ch === '"') ||
      (stringChar === "'" && ch === "'") ||
      (stringChar === '“' && ch === '”') ||
      (stringChar === '‘' && ch === '’')
    ) {
      inString = false
      stringChar = ''
      result += '"'
      i++
      continue
    }

    // 字符串内部：仅修复相对安全的中文标点（避免中文引号破坏字符串结构）
    if (ch === '、') { result += ','; i++; continue }
    if (ch === '，') { result += ','; i++; continue }
    if (ch === '：') { result += ':'; i++; continue }

    result += ch
    i++
  }

  return result
}

/**
 * 增强版解析：先尝试直接解析，失败后修复再试。
 * 如果所有尝试都失败，返回 fallback 而不是抛出错误，让上层可以降级展示。
 */
export function parseAIResponseRobust<T>(raw: string, fallback: T): T {
  if (!raw || !raw.trim()) {
    console.warn('[AI Parser] AI 返回内容为空，使用 fallback')
    return fallback
  }

  const jsonStr = extractJSON(raw)
  if (!jsonStr) {
    console.warn('[AI Parser] 未找到有效 JSON，使用 fallback。原始内容前 200 字符：', raw.slice(0, 200))
    return fallback
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

  // 第三次尝试：更激进的截断修复（正向扫描，正确处理字符串边界）
  try {
    const aggressivelyRepaired = aggressiveRepair(jsonStr)
    return JSON.parse(aggressivelyRepaired) as T
  } catch (e) {
    // 截断修复仍失败：记录完整诊断信息（长度 + 结尾片段），便于判断是否被 max_tokens 截断
    console.error('[AI Parser] 所有修复尝试均失败，使用 fallback。', {
      length: jsonStr.length,
      head: jsonStr.slice(0, 200),
      tail: jsonStr.slice(-200),
    })
  }

  return fallback
}

/**
 * 激进修复：正向扫描，正确处理字符串边界
 * 适用场景：AI 输出被 max_tokens 截断，JSON 不完整
 *
 * 策略：
 * 1. 正向扫描，记录字符串状态，找到最后一个"字符串外部"的完整键值对结束位置
 * 2. 截断到该位置，移除尾部逗号
 * 3. 补全缺失的括号
 */
function aggressiveRepair(str: string): string {
  // 正向扫描，找到最后一个"字符串外部"的完整值结束位置（",  / "}  / "]  / },  / ],）
  let lastSafeEnd = -1
  let inString = false
  let escape = false

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]

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

    // 字符串外部：检测完整值结束位置
    // 模式：`"` 后跟 `,` 或 `}` 或 `]`（允许空白）
    if (ch === '"') {
      // 不会到这里（上面已处理）
    } else if (ch === ',' || ch === '}' || ch === ']') {
      // 记录这个位置（值已完整结束）
      lastSafeEnd = i
    }
  }

  // 如果字符串未闭合（截断发生在字符串内部），需要回退到上一个安全位置
  if (inString) {
    // 找到最后一个 `",` 或 `"} ` 或 `"]` 的位置（字符串外部的完整结束）
    const safePatterns = [/",(\s*)/, /"}(\s*)/, /"](\s*)/, /\},(\s*)/, /\](\s*)/]
    let safePos = -1
    for (const pattern of safePatterns) {
      const matches = str.match(pattern)
      if (matches && matches.index !== undefined) {
        const end = matches.index + matches[0].length
        if (end > safePos) safePos = end
      }
    }
    if (safePos > 0) {
      lastSafeEnd = safePos - 1
    }
  }

  let truncated: string
  if (lastSafeEnd > 0) {
    // 截断到最后一个安全位置（包含该字符）
    truncated = str.substring(0, lastSafeEnd + 1)
    // 移除尾部逗号
    truncated = truncated.replace(/,(\s*)$/, '$1')
  } else {
    truncated = str
  }

  // 关键修复：在补全括号之前，先用 safeRepair 修复字符串内的非法转义字符
  // 否则 JSON.parse 仍会因 "Bad escaped character" 失败
  truncated = safeRepair(truncated)

  // 补全缺失的括号（正向扫描，正确计数字符串内外的括号）
  let openBraces = 0
  let closeBraces = 0
  let openBrackets = 0
  let closeBrackets = 0
  let inStr2 = false
  let esc2 = false
  for (let i = 0; i < truncated.length; i++) {
    const ch = truncated[i]
    if (esc2) { esc2 = false; continue }
    if (ch === '\\' && inStr2) { esc2 = true; continue }
    if (ch === '"') { inStr2 = !inStr2; continue }
    if (inStr2) continue
    if (ch === '{') openBraces++
    else if (ch === '}') closeBraces++
    else if (ch === '[') openBrackets++
    else if (ch === ']') closeBrackets++
  }

  for (let i = 0; i < openBrackets - closeBrackets; i++) truncated += ']'
  for (let i = 0; i < openBraces - closeBraces; i++) truncated += '}'

  return truncated
}

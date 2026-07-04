const API_BASE = '/api'

// ============ 环境检测 API ============

export interface EnvCheckResult {
  os: string
  node: { installed: boolean; version: string | null }
  npm: { installed: boolean; version: string | null }
  git: { installed: boolean; version: string | null }
}

export interface LanguageDetectResult {
  installed: boolean
  version: string | null
  error: string | null
}

export async function checkEnv(): Promise<EnvCheckResult> {
  const res = await fetch(`${API_BASE}/env/check`)
  return res.json()
}

export async function detectLanguage(languageId: string): Promise<LanguageDetectResult> {
  const res = await fetch(`${API_BASE}/env/detect-language`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ languageId }),
  })
  return res.json()
}

export function installEnv(
  tool: 'node' | 'git',
  onEvent: (event: any) => void,
): AbortController {
  const controller = new AbortController()

  fetch(`${API_BASE}/env/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool }),
    signal: controller.signal,
  }).then(async (res) => {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6))
            onEvent(event)
          } catch {}
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onEvent({ type: 'error', message: err.message })
    }
  })

  return controller
}

export function installLanguage(
  languageId: string,
  onEvent: (event: any) => void,
): AbortController {
  const controller = new AbortController()

  fetch(`${API_BASE}/env/install-language`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ languageId }),
    signal: controller.signal,
  }).then(async (res) => {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6))
            onEvent(event)
          } catch {}
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onEvent({ type: 'error', message: err.message })
    }
  })

  return controller
}

// ============ 用户数据持久化 API ============

export interface UserInfo {
  id: string
  name: string
  avatar: string
  createdAt: string
}

export interface UserData extends UserInfo {
  settings: Record<string, any> | null
  learning: Record<string, any> | null
}

export async function listUsers(): Promise<UserInfo[]> {
  try {
    const res = await fetch(`${API_BASE}/users`)
    return res.json()
  } catch {
    return []
  }
}

export async function createUser(name: string, avatar?: string): Promise<UserData> {
  const res = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, avatar }),
  })
  if (!res.ok) throw new Error((await res.json()).error || '创建用户失败')
  return res.json()
}

export async function getUserData(userId: string): Promise<UserData | null> {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function saveUserSettings(userId: string, settings: Record<string, any>): Promise<void> {
  try {
    await fetch(`${API_BASE}/users/${userId}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
  } catch {}
}

export async function saveUserLearning(userId: string, learning: Record<string, any>): Promise<void> {
  try {
    await fetch(`${API_BASE}/users/${userId}/learning`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(learning),
    })
  } catch {}
}

export async function deleteUser(userId: string): Promise<void> {
  await fetch(`${API_BASE}/users/${userId}`, { method: 'DELETE' })
}

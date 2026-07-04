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

// ============ AI 对话持久化 API ============

export interface ChatPayload {
  sessions: unknown[]
  currentSessionId: string | null
}

export async function getChatSessions(userId: string): Promise<ChatPayload | null> {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/chats`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function saveChatSessions(userId: string, payload: ChatPayload): Promise<void> {
  try {
    await fetch(`${API_BASE}/users/${userId}/chats`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    })
  } catch {}
}

// ============ 项目持久化 API ============

export interface ProjectFile {
  path: string
  content: string
}

export interface ProjectInfo {
  id: string
  name: string
  displayName: string
  description: string
  language: string
  createdAt: string
  updatedAt: string
}

export interface ProjectManagement {
  milestones: string[]
  risks: {
    description: string
    impact: 'high' | 'medium' | 'low'
    mitigation: string
  }[]
  estimatedDuration: string
  keyDependencies: string[]
}

export interface ProjectAnalysisData {
  projectId: string
  generatedAt: string
  projectName: string
  techStack: {
    language: string[]
    framework: string[]
    libraries: string[]
    tools: string[]
  }
  architecture: {
    pattern: string
    description: string
  }
  directoryAnalysis: {
    description: string
    suggestions: string[]
  }[]
  // 项目经理视角分析结果（AI 可能不返回，需做兜底）
  projectManagement?: ProjectManagement
  qualityScore: number
  suggestions: {
    category: string
    description: string
    priority: 'high' | 'medium' | 'low'
  }[]
}

export async function listProjects(userId: string): Promise<ProjectInfo[]> {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/projects`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function createProject(
  userId: string,
  project: {
    name: string
    displayName?: string
    description?: string
    language?: string
    files: ProjectFile[]
  },
): Promise<ProjectInfo> {
  const res = await fetch(`${API_BASE}/users/${userId}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  })
  if (!res.ok) throw new Error((await res.json()).error || '创建项目失败')
  return res.json()
}

export async function updateProject(
  userId: string,
  projectId: string,
  project: Partial<ProjectInfo>,
): Promise<ProjectInfo> {
  const res = await fetch(`${API_BASE}/users/${userId}/projects/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  })
  if (!res.ok) throw new Error((await res.json()).error || '更新项目失败')
  return res.json()
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/users/${userId}/projects/${projectId}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `删除项目失败 (HTTP ${res.status})`)
  }
}

export async function getProjectFiles(userId: string, projectId: string): Promise<{ type: 'file' | 'directory'; path: string; children?: any[] }[]> {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/projects/${projectId}/files`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function getProjectFileContent(userId: string, projectId: string, filePath: string): Promise<{ path: string; content: string } | null> {
  try {
    const encodedPath = encodeURIComponent(filePath)
    const res = await fetch(`${API_BASE}/users/${userId}/projects/${projectId}/files/${encodedPath}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function saveProjectAnalysis(
  userId: string,
  projectId: string,
  analysis: ProjectAnalysisData,
): Promise<void> {
  await fetch(`${API_BASE}/users/${userId}/projects/${projectId}/analysis`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(analysis),
  })
}

export async function getProjectAnalysis(userId: string, projectId: string): Promise<ProjectAnalysisData | null> {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/projects/${projectId}/analysis`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// 保存构建步骤
export async function saveProjectBuildSteps(
  userId: string,
  projectId: string,
  steps: any[],
): Promise<void> {
  await fetch(`${API_BASE}/users/${userId}/projects/${projectId}/buildSteps`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(steps),
  })
}

// 读取构建步骤
export async function getProjectBuildSteps(
  userId: string,
  projectId: string,
): Promise<any[] | null> {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/projects/${projectId}/buildSteps`)
    if (!res.ok) return null
    const data = await res.json()
    return data.steps || null
  } catch {
    return null
  }
}

// ============ API Key 安全存储 API ============
// 设计：apiKey 明文存后端文件，前端只持有脱敏预览
// 调用 AI 时前端传 userId + modelId，后端查存储的明文 key 调上游

// 保存（或更新）某个模型的 apiKey
export async function saveModelApiKey(
  userId: string,
  modelId: string,
  apiKey: string,
): Promise<{ preview: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/models/${encodeURIComponent(modelId)}/apiKey`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return { preview: data.preview }
  } catch {
    return null
  }
}

// 获取某个模型 apiKey 的脱敏预览
export async function getModelApiKeyPreview(
  userId: string,
  modelId: string,
): Promise<{ hasKey: boolean; preview: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/models/${encodeURIComponent(modelId)}/apiKey/preview`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// 删除某个模型的 apiKey
export async function deleteModelApiKey(userId: string, modelId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/models/${encodeURIComponent(modelId)}/apiKey`, {
      method: 'DELETE',
    })
    return res.ok
  } catch {
    return false
  }
}

// 批量获取所有模型的 apiKey 脱敏预览
// 返回 { "<modelId>": "sk-***...1234", ... }
export async function listApiKeyPreviews(
  userId: string,
): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/apiKeys`)
    if (!res.ok) return {}
    return res.json()
  } catch {
    return {}
  }
}

// ============ 代码执行 API ============

export interface ExecuteResult {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: string | null
  execTime: string
  success: boolean
  error?: string
}

export async function executeCode(
  language: string,
  code: string,
  stdin?: string,
): Promise<ExecuteResult> {
  const res = await fetch(`${API_BASE}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, code, stdin }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: '执行失败' }))
    throw new Error(data.error || '执行失败')
  }
  return res.json()
}

export async function getAvailableLanguages(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_BASE}/execute/languages`)
    if (!res.ok) return {}
    return res.json()
  } catch {
    return {}
  }
}

// ============ 阶段考试 API ============

export type ExamQuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'code_practice'

export interface ExamQuestion {
  id: string
  type: ExamQuestionType
  question: string
  options: string[]              // 选择题用
  correctIndex: number           // 选择题用
  explanation: string
  points: number
  // 简答题（short_answer）
  referenceAnswer?: string
  keywords?: string[]
  // 代码实操题（code_practice）
  starterCode?: string
  expectedOutput?: string
  hint?: string
}

export interface SubjectiveQuestionResult {
  questionId: string
  type: 'short_answer' | 'code_practice'
  question: string
  userAnswer: string
  referenceAnswer: string
  starterCode?: string
  expectedOutput?: string
  hint?: string
  keywords?: string[]
  explanation: string
  points: number
}

export interface ExamResult {
  takenAt: string
  score: number
  totalPoints: number
  percentage: number
  timeSpent: number
  wrongCount: number
  wrongQuestions: any[]
  // 主观题（简答/代码实操）不参与自动判分，单独记录供用户对照参考答案自评
  subjectiveQuestions?: SubjectiveQuestionResult[]
  subjectivePoints?: number      // 主观题总分值
}

export interface Exam {
  id: string
  title: string
  description: string
  category: string
  difficulty: 'easy' | 'medium' | 'hard'
  questions: ExamQuestion[]
  results: ExamResult[]
  createdAt: string
  updatedAt: string
}

export async function listExams(userId: string): Promise<Exam[]> {
  const res = await fetch(`${API_BASE}/users/${userId}/exams`)
  if (!res.ok) return []
  return res.json()
}

export async function getExam(userId: string, examId: string): Promise<Exam | null> {
  const res = await fetch(`${API_BASE}/users/${userId}/exams/${examId}`)
  if (!res.ok) return null
  return res.json()
}

export async function createExam(
  userId: string,
  data: { title: string; description?: string; category?: string; difficulty?: string; questions: any[] },
): Promise<Exam | null> {
  const res = await fetch(`${API_BASE}/users/${userId}/exams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) return null
  return res.json()
}

export async function deleteExam(userId: string, examId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/users/${userId}/exams/${examId}`, { method: 'DELETE' })
  return res.ok
}

export async function submitExam(
  userId: string,
  examId: string,
  answers: Record<string, number | string>,
  timeSpent: number,
): Promise<{ exam: Exam; result: ExamResult } | null> {
  const res = await fetch(`${API_BASE}/users/${userId}/exams/${examId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submitResult: true, answers, timeSpent }),
  })
  if (!res.ok) return null
  return res.json()
}

// ============ 考前速记 API ============

export interface MemorizeMaterialSummary {
  id: string
  title: string
  fileType: string
  aiSummary: string
  createdAt: number
  cardCount: number
}

export interface FlashCard {
  id: string
  front: string
  back: string
  tags: string[]
  status: 'new' | 'learning' | 'reviewing' | 'mastered'
  reviewCount: number
  wrongCount: number
  dayIndex: number
  nextReviewDate: string
  lastReviewDate: string
}

export interface MemorizeMaterial extends MemorizeMaterialSummary {
  userId: string
  rawContent: string
  cards: FlashCard[]
}

export async function listMemorizeMaterials(userId: string): Promise<MemorizeMaterialSummary[]> {
  const res = await fetch(`${API_BASE}/users/${userId}/memorize/materials`)
  if (!res.ok) return []
  return res.json()
}

export async function getMemorizeMaterial(userId: string, materialId: string): Promise<MemorizeMaterial | null> {
  const res = await fetch(`${API_BASE}/users/${userId}/memorize/materials/${materialId}`)
  if (!res.ok) return null
  return res.json()
}

export async function createMemorizeMaterial(
  userId: string,
  data: { title: string; rawContent: string; fileType: string; aiSummary: string; cards: { front: string; back: string; tags?: string[] }[] },
): Promise<MemorizeMaterial | null> {
  const res = await fetch(`${API_BASE}/users/${userId}/memorize/materials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) return null
  return res.json()
}

export async function updateCardStatus(
  userId: string,
  materialId: string,
  cardId: string,
  status: FlashCard['status'],
): Promise<FlashCard | null> {
  const res = await fetch(`${API_BASE}/users/${userId}/memorize/materials/${materialId}/cards/${cardId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function deleteMemorizeMaterial(userId: string, materialId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/users/${userId}/memorize/materials/${materialId}`, { method: 'DELETE' })
  return res.ok
}

export async function resetDayCards(userId: string, materialId: string, dayIndex: number): Promise<MemorizeMaterial | null> {
  const res = await fetch(`${API_BASE}/users/${userId}/memorize/materials/${materialId}/reset-day`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dayIndex }),
  })
  if (!res.ok) return null
  return res.json()
}

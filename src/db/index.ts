import Dexie, { type Table } from 'dexie'

// 学习路径
export interface LearningPath {
  id?: number
  language: string
  totalDays: number
  completedDays: number
  startDate: string
  yearlyPlan: string // JSON 字符串，存储年度计划
}

// 每日课程
export interface DailyLesson {
  id?: number
  pathId: number
  dayNumber: number
  title: string
  knowledgePoints: string // JSON 字符串，存储知识点列表
  codeExample: string
  exercise: string
  completed: boolean
  completedAt?: string
}

// 项目分析
export interface ProjectAnalysis {
  id?: number
  projectName: string
  techStack: string // JSON 字符串，存储技术栈列表
  directoryStructure: string
  analysisReport: string
  buildSteps: string // JSON 字符串，存储构建步骤
  createdAt: string
}

// 聊天消息
export interface ChatMessage {
  id?: number
  model: string
  role: 'user' | 'assistant'
  content: string
  codeBlocks: string // JSON 字符串，存储代码块列表
  createdAt: string
}

// 用户设置
export interface UserSettings {
  userId: string // 主键
  apiKeys: string // JSON 字符串，存储 API 密钥映射
  defaultModel: string
  modelParams: string // JSON 字符串，存储模型参数
  learningPrefs: string // JSON 字符串，存储学习偏好
  theme: 'dark' | 'light'
}

// 成就
export interface Achievement {
  id?: number
  type: string
  name: string
  description: string
  earnedAt: string
}

// Dexie 数据库实例
class CodeMentorDB extends Dexie {
  learningPaths!: Table<LearningPath, number>
  dailyLessons!: Table<DailyLesson, number>
  projectAnalyses!: Table<ProjectAnalysis, number>
  chatMessages!: Table<ChatMessage, number>
  userSettings!: Table<UserSettings, string>
  achievements!: Table<Achievement, number>

  constructor() {
    super('CodeMentorDB')

    this.version(1).stores({
      learningPaths: '++id, language, startDate',
      dailyLessons: '++id, pathId, dayNumber, completed',
      projectAnalyses: '++id, projectName, createdAt',
      chatMessages: '++id, model, role, createdAt',
      userSettings: 'userId',
      achievements: '++id, type, earnedAt',
    })
  }
}

export const db = new CodeMentorDB()

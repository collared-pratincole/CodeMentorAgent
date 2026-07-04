/**
 * AI 输出的标准 JSON Schema 定义
 * 所有 AI 返回必须严格遵循这些格式，前端据此渲染
 */

// ==================== 学习计划 ====================
export interface LearningPlanOutput {
  type: 'learning_plan'
  overview: string
  months: {
    month: number        // 1-12
    title: string        // 月度主题，如 "Python 基础入门"
    topics: string[]     // 4-6 个主题，如 ["变量与数据类型", "运算符"]
  }[]
}

// ==================== 每日课程 ====================
export interface DailyLessonOutput {
  type: 'daily_lesson'
  title: string                           // 课程标题
  sections: LessonSection[]               // 知识点段落列表
  exercise: {
    description: string                   // 练习描述
    starterCode: string                   // 起始代码
    hint: string                          // 提示
    expectedOutput: string                // 预期输出
  }
}

export interface LessonSection {
  heading: string                         // 段落标题
  level: 1 | 2 | 3                       // 标题级别 1=大标题 2=中标题 3=小标题
  body: string                            // 正文（纯文本，支持 **粗体** 和 `代码` 内联标记）
  code?: {                                // 可选代码示例
    language: string                      // 语言标识，如 "python", "javascript"
    content: string                       // 代码内容
    caption?: string                      // 代码说明
  }
  tip?: string                            // 可选提示框内容
  list?: string[]                         // 可选列表项
}

// ==================== 项目分析 ====================
export interface ProjectAnalysisOutput {
  type: 'project_analysis'
  projectName: string
  techStack: {
    language: string[]                    // 使用的编程语言
    framework: string[]                   // 框架
    libraries: string[]                   // 主要依赖库
    tools: string[]                       // 构建工具等
  }
  architecture: {
    pattern: string                       // 架构模式，如 "MVC", "微服务"
    description: string                   // 架构说明
  }
  directoryAnalysis: {
    description: string                   // 目录结构分析
    suggestions: string[]                 // 改进建议
  }[]
  qualityScore: number                    // 0-100
  suggestions: {
    category: string                      // 分类
    description: string                   // 建议
    priority: 'high' | 'medium' | 'low'   // 优先级
  }[]
}

// ==================== 项目构建步骤 ====================
export interface BuildStepOutput {
  type: 'build_step'
  step: number
  totalSteps: number
  title: string
  description: string
  commands: string[]                      // 要执行的命令
  code?: {
    language: string
    content: string
    caption?: string
  }
  expectedResult: string
  troubleshooting: {
    problem: string
    solution: string
  }[]
}

// ==================== 代码审查 ====================
export interface CodeReviewOutput {
  type: 'code_review'
  score: number                           // 0-100
  issues: {
    severity: 'error' | 'warning' | 'info'
    category: string                      // 如 "正确性", "风格", "性能"
    description: string
    suggestion: string
    line?: number
  }[]
  improvedCode?: string
  summary: string
}

// ==================== AI 对话（代码解释等） ====================
export interface ChatCodeOutput {
  type: 'chat_code'
  explanation: string                     // 解释文本
  code?: {
    language: string
    content: string
  }
}

// ==================== 类型守卫 ====================
export function isLearningPlan(data: any): data is LearningPlanOutput {
  return data?.type === 'learning_plan' && Array.isArray(data?.months)
}

export function isDailyLesson(data: any): data is DailyLessonOutput {
  return data?.type === 'daily_lesson' && Array.isArray(data?.sections) && data?.exercise != null
}

export function isProjectAnalysis(data: any): data is ProjectAnalysisOutput {
  return data?.type === 'project_analysis' && data?.techStack != null
}

export function isBuildStep(data: any): data is BuildStepOutput {
  return data?.type === 'build_step' && typeof data?.step === 'number'
}

export function isCodeReview(data: any): data is CodeReviewOutput {
  return data?.type === 'code_review' && typeof data?.score === 'number'
}

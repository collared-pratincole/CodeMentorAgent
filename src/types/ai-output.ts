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
  // 项目概览（AI 可能漏掉，类型守卫不强制要求）
  projectOverview?: {
    projectType: string                   // 项目类型分类，如 "Web 应用"
    whatItIs: string                      // 项目本身是什么
    purpose: string                       // 项目用途、解决的问题
    targetUsers: string[]                 // 目标用户
    coreFeatures: string[]                // 核心功能列表
    valueProposition: string              // 核心价值/亮点
  }
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
  // 项目经理视角分析结果（AI 可能漏掉，类型守卫不强制要求）
  projectManagement?: {
    milestones: string[]                  // 主要开发里程碑
    risks: {
      description: string
      impact: 'high' | 'medium' | 'low'
      mitigation: string
    }[]
    estimatedDuration: string             // 总开发周期估算
    keyDependencies: string[]             // 关键外部依赖
  }
  qualityScore: number                    // 0-100
  suggestions: {
    category: string                      // 分类
    description: string                   // 建议
    priority: 'high' | 'medium' | 'low'   // 优先级
  }[]
}

// ==================== 项目构建大纲（AI 自主决定总步数） ====================
export interface BuildPlanOutput {
  type: 'build_plan'
  totalSteps: number                      // AI 自主决定的总步数
  projectName: string
  summary: string                         // 构建路线概述
  steps: {
    step: number                          // 从 1 开始递增
    title: string                         // 步骤标题
    goal: string                          // 这一步的核心目标
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
// AI 输出偶尔会漏掉 type 字段，这里放宽 type 校验，但严格校验关键字段
export function isLearningPlan(data: any): data is LearningPlanOutput {
  return Array.isArray(data?.months)
}

export function isDailyLesson(data: any): data is DailyLessonOutput {
  return Array.isArray(data?.sections) && data?.exercise != null
}

export function isProjectAnalysis(data: any): data is ProjectAnalysisOutput {
  return (
    typeof data?.projectName === 'string' &&
    data?.techStack != null &&
    Array.isArray(data?.techStack?.language) &&
    Array.isArray(data?.techStack?.framework) &&
    Array.isArray(data?.techStack?.libraries) &&
    Array.isArray(data?.techStack?.tools) &&
    data?.architecture != null &&
    typeof data?.architecture?.description === 'string' &&
    Array.isArray(data?.directoryAnalysis) &&
    typeof data?.qualityScore === 'number' &&
    Array.isArray(data?.suggestions)
  )
}

export function isBuildPlan(data: any): data is BuildPlanOutput {
  return (
    typeof data?.totalSteps === 'number' &&
    Array.isArray(data?.steps) &&
    data.steps.length > 0 &&
    typeof data?.steps?.[0]?.title === 'string'
  )
}

export function isBuildStep(data: any): data is BuildStepOutput {
  return (
    typeof data?.step === 'number' &&
    typeof data?.title === 'string' &&
    typeof data?.description === 'string' &&
    Array.isArray(data?.commands)
  )
}

export function isCodeReview(data: any): data is CodeReviewOutput {
  return typeof data?.score === 'number' && Array.isArray(data?.issues)
}

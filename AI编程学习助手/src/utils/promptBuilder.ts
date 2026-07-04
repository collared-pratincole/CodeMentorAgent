/**
 * AI 提示词构建工具
 * 每个 prompt 都包含严格的 JSON Schema 定义，确保 AI 输出可被前端可靠解析
 */

import type { LearningProfile } from '@/stores/useLearningStore'

// ==================== 公共指令 ====================
const JSON_INSTRUCTION = `
## 输出格式要求（极其重要）
你必须且只能返回一个合法的 JSON 对象，不要返回任何其他文字、解释或标记。
不要用 \`\`\`json 包裹，直接输出 JSON 文本。
确保所有字符串值正确转义（换行用 \\n，引号用 \\"）。
确保 JSON 语法正确，不要有尾部逗号。`

// ==================== 学习计划 ====================
export function buildLearningPlanPrompt(profile: LearningProfile): string {
  const styleMap = {
    balanced: '理论与实战均衡',
    theory: '偏重理论，深入理解原理',
    practice: '偏重实战，多做项目练习',
  }

  return `你是一位资深的编程教育专家，请根据以下学情信息，为学员制定一份个性化的年度学习计划。

## 学员信息
- **学习语言**：${profile.language}
- **基础情况**：${profile.background || '零基础'}
- **学习目标**：${profile.goal || '掌握该语言的核心能力'}
- **每日学习时长**：${profile.dailyMinutes} 分钟
- **学习风格偏好**：${styleMap[profile.style]}

## 内容要求
1. 根据学员的基础和目标，制定 12 个月的学习路线
2. 每个月包含 4-6 个核心主题
3. 内容难度循序渐进，符合学员当前水平
4. 如果学员有基础，前期可适当加速
5. 如果学员目标明确，后期侧重相关技能
6. 最后 2 个月安排实战项目

${JSON_INSTRUCTION}

## JSON Schema
{
  "type": "learning_plan",
  "overview": "对整个学习计划的概述，2-3句话",
  "months": [
    {
      "month": 1,
      "title": "月度主题名称",
      "topics": ["主题1", "主题2", "主题3", "主题4"]
    },
    {
      "month": 2,
      "title": "第二个月主题",
      "topics": ["主题1", "主题2", "主题3", "主题4", "主题5"]
    }
  ]
}

## 字段说明
- type: 固定值 "learning_plan"
- overview: 字符串，2-3句话概述
- months: 数组，必须包含 12 个元素（month 从 1 到 12）
- month: 数字，月份序号
- title: 字符串，月度主题名称
- topics: 字符串数组，4-6 个核心主题名称`
}

// ==================== 每日课程 ====================
export function buildDailyLessonPrompt(
  language: string,
  dayNumber: number,
  topic: string,
  monthContext: string,
  background: string,
  style: string,
  previousTopics: string[]
): string {
  const previousStr = previousTopics.length > 0
    ? `\n## 已学过的主题\n${previousTopics.map((t) => `- ${t}`).join('\n')}`
    : ''

  const styleGuide = style === 'theory'
    ? '侧重概念讲解和原理分析，代码示例用于验证理解'
    : style === 'practice'
    ? '简洁讲解概念，重点放在代码练习和动手实践上'
    : '概念讲解和代码实践各占一半'

  return `你是一位专业的${language}编程导师，请为学员设计第 ${dayNumber} 天的学习课程。

## 学习语言
${language}

## 今日主题
${topic}

## 所在月份主题
${monthContext}

## 学员基础
${background || '零基础'}

## 教学风格
${styleGuide}
${previousStr}

## 内容要求
1. 课程内容循序渐进，与之前学过的知识衔接
2. 代码示例要有详细中文注释
3. 练习题要有趣且实用
4. 语言通俗易懂，适合自学
5. 每个知识点段落包含：标题 + 正文 + 可选代码示例 + 可选提示

${JSON_INSTRUCTION}

## JSON Schema
{
  "type": "daily_lesson",
  "title": "课程标题",
  "sections": [
    {
      "heading": "知识点标题",
      "level": 2,
      "body": "知识点正文讲解，支持 **粗体** 和 \`代码\` 内联标记",
      "code": {
        "language": "${language}",
        "content": "代码示例内容",
        "caption": "代码说明（可选）"
      },
      "tip": "提示框内容（可选，没有就不写这个字段）",
      "list": ["要点1", "要点2", "要点3"]
    },
    {
      "heading": "另一个知识点",
      "level": 3,
      "body": "正文内容"
    }
  ],
  "exercise": {
    "description": "练习题描述，告诉学员要做什么",
    "starterCode": "# 练习：按照注释完成代码\\n# 1. 创建变量\\nage = \\n\\n# 2. 打印结果\\nprint(age)",
    "hint": "给学员的一句话提示",
    "expectedOutput": "预期运行结果的描述"
  }
}

## 字段说明
- type: 固定值 "daily_lesson"
- title: 字符串，课程标题
- sections: 数组，3-6 个知识点段落
  - heading: 字符串，段落标题
  - level: 数字，标题级别（1=大标题, 2=中标题, 3=小标题）
  - body: 字符串，正文（支持 **粗体** 和 \`代码\` 内联标记，换行用 \\n）
  - code: 可选对象，代码示例
    - language: 字符串，语言标识
    - content: 字符串，代码内容（换行用 \\n）
    - caption: 可选字符串，代码说明
  - tip: 可选字符串，提示框内容（没有就不写）
  - list: 可选字符串数组，列表要点（没有就不写）
- exercise: 对象，课后练习
  - description: 字符串，练习描述
  - starterCode: 字符串，起始代码（换行用 \\n，用注释引导学员填写）
  - hint: 字符串，一句话提示
  - expectedOutput: 字符串，预期输出描述`
}

// ==================== 项目分析 ====================
export function buildProjectAnalysisPrompt(files: string[], structure: string): string {
  return `你是一位资深的全栈开发架构师，请对以下项目进行全面分析。

## 项目目录结构
\`\`\`
${structure}
\`\`\`

## 项目文件列表
${files.map((f) => `- ${f}`).join('\n')}

## 分析要求
1. 识别项目使用的编程语言、框架、库和工具
2. 分析项目的整体架构模式
3. 评估目录组织是否合理
4. 提出具体的改进建议

${JSON_INSTRUCTION}

## JSON Schema
{
  "type": "project_analysis",
  "projectName": "项目名称",
  "techStack": {
    "language": ["语言1", "语言2"],
    "framework": ["框架1"],
    "libraries": ["库1", "库2"],
    "tools": ["工具1"]
  },
  "architecture": {
    "pattern": "架构模式名称",
    "description": "架构说明"
  },
  "directoryAnalysis": [
    {
      "description": "目录分析描述",
      "suggestions": ["建议1", "建议2"]
    }
  ],
  "qualityScore": 85,
  "suggestions": [
    {
      "category": "分类名称",
      "description": "建议描述",
      "priority": "high"
    }
  ]
}

## 字段说明
- type: 固定值 "project_analysis"
- projectName: 字符串
- techStack: 对象，包含 language/framework/libraries/tools 四个数组
- architecture: 对象，pattern 为架构模式名称，description 为说明
- directoryAnalysis: 数组，每项含 description 和 suggestions
- qualityScore: 数字，0-100
- suggestions: 数组，priority 为 "high"/"medium"/"low"`
}

// ==================== 项目构建步骤 ====================
export function buildBuildStepPrompt(
  step: number,
  totalSteps: number,
  projectContext: string
): string {
  return `你是一位经验丰富的项目构建专家，请为项目生成第 ${step} 步（共 ${totalSteps} 步）的详细构建指南。

## 项目上下文
${projectContext}

${JSON_INSTRUCTION}

## JSON Schema
{
  "type": "build_step",
  "step": ${step},
  "totalSteps": ${totalSteps},
  "title": "步骤标题",
  "description": "详细说明这一步要做什么以及为什么",
  "commands": ["命令1", "命令2"],
  "code": {
    "language": "语言标识",
    "content": "需要编写或修改的代码",
    "caption": "代码说明"
  },
  "expectedResult": "执行成功后应该看到的结果",
  "troubleshooting": [
    {
      "problem": "可能遇到的问题",
      "solution": "解决方案"
    }
  ]
}

## 字段说明
- type: 固定值 "build_step"
- step/totalSteps: 数字
- title: 字符串，步骤标题
- description: 字符串，步骤描述
- commands: 字符串数组，要执行的命令
- code: 可选对象，需要编写/修改的代码
- expectedResult: 字符串
- troubleshooting: 数组，常见问题及解决方案`
}

// ==================== 代码审查 ====================
export function buildCodeReviewPrompt(
  userCode: string,
  expectedCode: string | undefined,
  language: string
): string {
  const expectedSection = expectedCode
    ? `\n## 参考实现\n\`\`\`${language}\n${expectedCode}\n\`\`\``
    : ''

  return `你是一位${language}代码审查专家，请对以下代码进行详细审查。

## 用户代码
\`\`\`${language}
${userCode}
\`\`\`
${expectedSection}

## 审查维度
1. 正确性：代码逻辑是否正确
2. 代码风格：是否符合编码规范
3. 性能：是否存在性能问题
4. 安全性：是否存在安全隐患

${JSON_INSTRUCTION}

## JSON Schema
{
  "type": "code_review",
  "score": 85,
  "issues": [
    {
      "severity": "warning",
      "category": "风格",
      "description": "问题描述",
      "suggestion": "修改建议",
      "line": 10
    }
  ],
  "improvedCode": "改进后的完整代码",
  "summary": "总体评价总结"
}

## 字段说明
- type: 固定值 "code_review"
- score: 数字，0-100
- issues: 数组
  - severity: "error" / "warning" / "info"
  - category: 字符串，如 "正确性"/"风格"/"性能"/"安全"
  - description: 字符串，问题描述
  - suggestion: 字符串，修改建议
  - line: 可选数字，行号
- improvedCode: 可选字符串，改进后的完整代码
- summary: 字符串，总体评价`
}

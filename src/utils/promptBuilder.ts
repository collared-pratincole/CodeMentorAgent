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
  return `你是一位资深的项目经理兼全栈架构师，请以「项目管理 + 技术架构」双重视角对以下项目进行全面分析。

## 项目目录结构
\`\`\`
${structure}
\`\`\`

## 项目文件列表
${files.map((f) => `- ${f}`).join('\n')}

## 分析要求
1. **项目概览（重要，内容要充实）**：从「项目本身是什么」和「它的用途」出发，说清楚这是一类什么样的项目、解决什么问题、面向什么用户、提供哪些核心功能、它的价值在哪里。这是整份报告的开篇，要让读者一眼看懂这个项目是干嘛的
2. 识别项目使用的编程语言、框架、库和工具
3. 分析项目的整体架构模式
4. 评估目录组织是否合理
5. 站在项目经理视角，拆解关键里程碑、识别主要风险与依赖、给出开发周期估算
6. 提出具体的改进建议

${JSON_INSTRUCTION}

## JSON Schema
{
  "type": "project_analysis",
  "projectName": "项目名称",
  "projectOverview": {
    "projectType": "项目类型分类，如「Web 应用」「命令行工具」「API 服务」「桌面应用」「数据分析脚本」等",
    "whatItIs": "详细说明这个项目本身是什么：从代码结构、技术选型和实现方式角度，描述它的形态（2-4 句话）",
    "purpose": "详细说明这个项目的用途：它解决什么问题、用在什么场景下、为什么需要它（3-5 句话）",
    "targetUsers": "目标用户或使用方，如「开发者」「运维」「最终用户」「内部团队」等，可多个",
    "coreFeatures": ["核心功能1：简短说明", "核心功能2：简短说明", "核心功能3：简短说明"],
    "valueProposition": "这个项目的核心价值/亮点，它相比其他方案的优势在哪里（1-3 句话）"
  },
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
  "projectManagement": {
    "milestones": ["里程碑1：项目初始化", "里程碑2：核心功能实现"],
    "risks": [
      {
        "description": "风险描述",
        "impact": "high",
        "mitigation": "应对方案"
      }
    ],
    "estimatedDuration": "总开发周期估算，如 4-6 周",
    "keyDependencies": ["关键外部依赖1"]
  },
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
- projectOverview: 对象，项目概览（开篇要让读者一眼看懂项目是干嘛的，内容要充实）
  - projectType: 字符串，项目类型分类
  - whatItIs: 字符串，详细说明项目本身是什么（2-4 句话）
  - purpose: 字符串，详细说明项目用途、解决的问题和场景（3-5 句话）
  - targetUsers: 字符串数组，目标用户或使用方
  - coreFeatures: 字符串数组，3-6 个核心功能
  - valueProposition: 字符串，项目核心价值/亮点（1-3 句话）
- techStack: 对象，包含 language/framework/libraries/tools 四个数组
- architecture: 对象，pattern 为架构模式名称，description 为说明
- directoryAnalysis: 数组，每项含 description 和 suggestions
- projectManagement: 对象，项目经理视角的分析结果
  - milestones: 字符串数组，主要开发里程碑
  - risks: 数组，每项含 description（风险描述）、impact（影响等级 high/medium/low）、mitigation（应对方案）
  - estimatedDuration: 字符串，总开发周期估算
  - keyDependencies: 字符串数组，关键外部依赖
- qualityScore: 数字，0-100
- suggestions: 数组，priority 为 "high"/"medium"/"low"`
}

// ==================== 项目构建大纲（让 AI 自主决定总步数） ====================
export function buildBuildPlanPrompt(projectContext: string): string {
  return `你是一位经验丰富的全栈工程师导师，请根据以下项目分析结果，规划从零开始构建该项目的完整步骤大纲。

## 项目上下文
${projectContext}

## 你的任务
请像一位资深的导师一样，规划出从零到一完整复现这个项目所需的全部步骤。
**总步数由你自主决定**——根据项目的复杂度给出合理的步数：
- 小型/简单项目：5-8 步
- 中型项目：8-15 步
- 大型/复杂项目：15-25 步

每一步应该是一个清晰的、可独立完成的里程碑（如：初始化项目、创建数据模型、实现某个 API、编写某个前端页面、配置路由、对接联调、收尾部署等）。

要求：
1. 步骤之间要有清晰的递进关系，前一步是后一步的基础
2. 每一步只聚焦一个核心任务
3. 不要遗漏关键环节（项目初始化、依赖安装、核心功能、联调、收尾）
4. 每步给出简洁标题和一句话核心目标

${JSON_INSTRUCTION}

## JSON Schema
{
  "type": "build_plan",
  "totalSteps": 数字（你决定的总步数）,
  "projectName": "项目名称",
  "summary": "对整个构建路线的概述，2-3 句话",
  "steps": [
    {
      "step": 1,
      "title": "步骤标题（简洁概括这一步要做什么）",
      "goal": "这一步的核心目标，一句话说明要完成什么任务"
    },
    {
      "step": 2,
      "title": "步骤标题",
      "goal": "核心目标"
    }
  ]
}

## 字段说明
- type: 固定值 "build_plan"
- totalSteps: 数字，你自主决定的总步数（5-25 之间）
- projectName: 字符串
- summary: 字符串，构建路线概述
- steps: 数组，长度必须等于 totalSteps
  - step: 数字，从 1 开始递增
  - title: 字符串，步骤标题
  - goal: 字符串，这一步的核心目标`
}

// ==================== 项目构建步骤（单步详细生成） ====================
export function buildBuildStepPrompt(
  step: number,
  totalSteps: number,
  projectContext: string,
  stepPlan?: { title: string; goal: string }
): string {
  const planSection = stepPlan
    ? `\n## 这一步的规划要求（来自整体大纲）\n- 步骤标题：${stepPlan.title}\n- 核心目标：${stepPlan.goal}\n请严格按照上述规划生成这一步的详细内容，标题要和规划保持一致。`
    : ''

  return `你是一位经验丰富的全栈工程师导师，正在手把手教学生从零开始构建这个项目。

## 项目上下文
${projectContext}
${planSection}

## 你的任务
这是从零到一构建整个项目的第 ${step} 步（共 ${totalSteps} 步）。请像一位耐心的导师一样，详细指导学生完成这一步。每一步都应该是一个清晰的、可独立完成的里程碑，让学生在完成所有步骤后能完整复现整个项目。

要求：
- 每一步只聚焦一个核心任务（如初始化项目、创建数据模型、实现某个 API、编写前端页面等）
- 给出完整的代码，不要省略或用注释代替
- 解释为什么这样做，而不仅仅是做什么
- 确保学生按步骤执行后能运行并看到效果

${JSON_INSTRUCTION}

## JSON Schema
{
  "type": "build_step",
  "step": ${step},
  "totalSteps": ${totalSteps},
  "title": "步骤标题（简洁概括这一步要做什么）",
  "description": "详细说明这一步的目标、原理和为什么要这样做。像导师讲解一样，让学生理解背后的设计思路。",
  "commands": ["需要在终端执行的命令，如 npm install express 等"],
  "code": {
    "language": "编程语言标识，如 python、javascript、bash 等",
    "content": "完整的代码内容，不要省略任何部分。如果是新文件，给出完整文件内容；如果是修改已有文件，给出修改后的完整代码。",
    "caption": "代码说明，如 '创建 main.py 文件' 或 '修改 app.js 中的路由配置'"
  },
  "expectedResult": "执行完这一步后应该看到什么效果，如终端输出、浏览器显示的内容等",
  "troubleshooting": [
    {
      "problem": "学生可能遇到的常见问题",
      "solution": "具体的解决方案"
    }
  ]
}

## 字段说明
- type: 固定值 "build_step"
- step/totalSteps: 数字，当前步骤和总步骤数
- title: 字符串，步骤标题
- description: 字符串，导师式讲解，说明目标、原理和设计思路
- commands: 字符串数组，需要在终端执行的命令（如无命令则为空数组）
- code: 对象，需要编写/修改的完整代码（如这一步不需要写代码，code 可省略）
- expectedResult: 字符串，执行成功后的预期效果
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

// ==================== 阶段考试生成 ====================
// 题型：multiple_choice 选择题 / short_answer 简答题 / code_practice 代码实操题
export function buildExamPrompt(options: {
  topic: string
  difficulty: 'easy' | 'medium' | 'hard'
  count?: number                          // 选择题数量
  context?: string
  shortAnswerCount?: number               // 简答题数量（默认 0）
  codePracticeCount?: number              // 代码实操题数量（默认 0）
}): string {
  const {
    topic,
    difficulty,
    count = 10,
    context,
    shortAnswerCount = 0,
    codePracticeCount = 0,
  } = options
  const diffMap = {
    easy: '基础概念和语法，适合初学者',
    medium: '中等难度，涉及实际应用和常见陷阱',
    hard: '高级题目，涉及底层原理、性能优化和复杂场景',
  }

  // 题型与数量说明
  const sections = [`${count} 道选择题（multiple_choice）`]
  if (shortAnswerCount > 0) sections.push(`${shortAnswerCount} 道简答题（short_answer）`)
  if (codePracticeCount > 0) sections.push(`${codePracticeCount} 道代码实操题（code_practice）`)

  // 各题型 schema 描述
  const choiceSchema = `    {
      "type": "multiple_choice",
      "question": "字符串，题目内容",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correctIndex": 数字（0-3，正确选项的索引）,
      "explanation": "字符串，详细解析",
      "points": 数字（每题分值，默认10）
    }`

  const shortSchema = `    {
      "type": "short_answer",
      "question": "字符串，简答题题目",
      "referenceAnswer": "字符串，标准参考答案（详细、可直接对照自评）",
      "keywords": ["字符串数组，答案中应包含的关键概念关键词"],
      "explanation": "字符串，答题思路与要点说明",
      "points": 数字（每题分值，默认15）
    }`

  const codeSchema = `    {
      "type": "code_practice",
      "question": "字符串，代码实操题题目描述（包含功能需求与输入输出说明）",
      "starterCode": "字符串，起始代码框架（含注释占位）",
      "expectedOutput": "字符串，预期运行输出或行为描述",
      "hint": "字符串，实现提示（不给完整答案）",
      "referenceAnswer": "字符串，完整参考实现代码",
      "explanation": "字符串，实现要点解析",
      "points": 数字（每题分值，默认20）
    }`

  const schemaParts = [choiceSchema]
  if (shortAnswerCount > 0) schemaParts.push(shortSchema)
  if (codePracticeCount > 0) schemaParts.push(codeSchema)

  return `你是一位资深的编程教育专家，请根据以下要求生成一份考试卷。

## 考试主题
${topic}

## 难度要求
${diffMap[difficulty]}

## 题目数量与题型
${sections.join('\n')}

${context ? `## 参考背景\n${context}\n` : ''}

## 出题要求
### 选择题（multiple_choice）
1. 每道题必须有 4 个选项（A/B/C/D），只有一个正确答案
2. 必须有详细的解析说明
3. 题目要覆盖该主题的不同知识点
4. 不要出过于简单或过于晦涩的题
5. 干扰项要合理，不能明显错误

### 简答题（short_answer）
1. 题目应考察对概念的理解或综合应用
2. referenceAnswer 必须完整、可直接用于自评对照
3. keywords 列出 3-6 个关键概念关键词

### 代码实操题（code_practice）
1. 题目描述要清晰说明功能需求与输入输出
2. starterCode 提供合理的代码框架（含注释占位）
3. referenceAnswer 提供完整可运行的参考实现
4. 难度与本卷整体难度匹配

${JSON_INSTRUCTION}

## JSON Schema
{
  "title": "字符串，考试标题",
  "description": "字符串，一句话描述考试内容",
  "category": "字符串，分类（如 JavaScript/Python/React）",
  "difficulty": "${difficulty}",
  "questions": [
${schemaParts.join(',\n')}
  ]
}

## 重要：questions 数组顺序
必须按"选择题 → 简答题 → 代码实操题"的顺序输出所有题目。`
}

// ==================== 主观题 AI 评分 ====================
export interface SubjectiveGradingItem {
  questionId: string
  type: 'short_answer' | 'code_practice'
  question: string
  userAnswer: string
  referenceAnswer: string
  keywords: string[]
  points: number          // 该题满分
}

export function buildSubjectiveGradingPrompt(items: SubjectiveGradingItem[]): string {
  const itemsText = items.map((it, i) => {
    const kw = it.keywords?.length ? it.keywords.join('、') : '（无）'
    return `### 第 ${i + 1} 题（questionId: ${it.questionId}）
- 题型：${it.type === 'code_practice' ? '代码实操题' : '简答题'}
- 满分：${it.points} 分
- 题目：${it.question}
- 参考答案：${it.referenceAnswer || '（无）'}
- 关键词：${kw}
- 学生作答：
\`\`\`
${it.userAnswer || '（未作答）'}
\`\`\``
  }).join('\n\n')

  return `你是一位资深的编程教育专家，请对以下学生作答进行评分。

## 评分任务
针对每道主观题（简答题 / 代码实操题），根据参考答案与关键词进行评分，给出分数、评语和命中关键词。

## 评分标准
- 简答题：按关键概念覆盖度评分，命中关键词越多分越高；表述清晰、逻辑正确可酌情加分
- 代码实操题：按功能完整性、正确性、代码质量评分；能实现核心功能给主要分数，有语法错误或逻辑缺陷扣分
- 学生未作答：0 分
- 给分必须为 0 到满分之间的整数

## 待评分子目
${itemsText}

${JSON_INSTRUCTION}

## JSON Schema
{
  "gradings": [
    {
      "questionId": "字符串，对应每题的 questionId",
      "score": 数字（0 到满分，整数）,
      "maxScore": 数字（该题满分）,
      "comment": "字符串，中文评语，指出优点与不足，2-4 句话",
      "matchedKeywords": ["字符串数组，学生答案中命中的关键词"]
    }
  ]
}

## 重要
- gradings 数组必须包含上述每一题，questionId 一一对应
- score 不能超过 maxScore
- comment 必须基于学生实际作答内容，不能空泛`
}

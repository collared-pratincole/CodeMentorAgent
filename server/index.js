const express = require('express');
const { exec, execSync, spawn } = require('child_process');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const util = require('util');

// 异步执行命令（带超时），永不阻塞事件循环
const execAsync = (command, options = {}) =>
  new Promise((resolve) => {
    const timeout = options.timeout || 5000;
    let settled = false;
    const child = exec(
      command,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], ...options, timeout },
      (err, stdout, stderr) => {
        if (settled) return;
        settled = true;
        if (err) resolve({ ok: false, stdout: stdout || '', stderr: stderr || '' });
        else resolve({ ok: true, stdout: stdout || '', stderr: stderr || '' });
      }
    );
    // 双保险：超时后强制结束
    setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      resolve({ ok: false, stdout: '', stderr: 'timeout' });
    }, timeout + 200);
  });

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = parseInt(process.env.CM_PORT || '3001', 10);
// 数据目录：优先用环境变量（Electron 打包后指向 userData），开发模式用默认路径
const DATA_DIR = process.env.CM_DATA_DIR
  ? path.join(process.env.CM_DATA_DIR, 'users')
  : path.join(__dirname, 'data', 'users');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============ 路径与工具函数 ============

function safeId(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

function getUserDir(userId) {
  return path.join(DATA_DIR, safeId(userId));
}

function getUserFilePath(userId) {
  return path.join(getUserDir(userId), 'user.json');
}

function getProjectsDir(userId) {
  return path.join(getUserDir(userId), 'projects');
}

function getProjectDir(userId, projectId) {
  return path.join(getProjectsDir(userId), safeId(projectId));
}

function getProjectFilePath(userId, projectId) {
  return path.join(getProjectDir(userId, projectId), 'project.json');
}

function getProjectSourceDir(userId, projectId) {
  return path.join(getProjectDir(userId, projectId), 'source');
}

function getProjectAnalysisPath(userId, projectId) {
  return path.join(getProjectDir(userId, projectId), 'analysis.json');
}

function getProjectBuildStepsPath(userId, projectId) {
  return path.join(getProjectDir(userId, projectId), 'buildSteps.json');
}

// API Key 安全存储：明文文件存储在用户目录下，前端不持有明文 key
// 仅返回脱敏预览（如 sk-***...1234）供 UI 展示
function getApiKeysFilePath(userId) {
  return path.join(getUserDir(userId), 'apiKeys.json');
}

function readApiKeys(userId) {
  return readJsonFile(getApiKeysFilePath(userId)) || {};
}

function writeApiKeys(userId, keys) {
  ensureUserDir(userId);
  writeJsonFile(getApiKeysFilePath(userId), keys);
}

// 生成脱敏预览：sk-abc...xyz123 → sk-***...1234（显示前 3 + 后 4）
// 短 key（<10 字符）→ ***
function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  const s = key.trim();
  if (s.length < 10) return '***';
  return `${s.slice(0, 3)}***...${s.slice(-4)}`;
}

function ensureUserDir(userId) {
  const dir = getUserDir(userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function deleteDirRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  // 先尝试 fs.rmSync（带重试）
  try {
    fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (e) {
    // fs.rmSync 失败，继续尝试下面的系统命令回退方案
    console.warn(`[deleteDirRecursive] fs.rmSync 失败: ${e.message}，尝试系统命令`);
  }
  // Windows 上 fs.rmSync 可能静默失败（目录仍存在），用系统命令回退
  if (fs.existsSync(dirPath)) {
    try {
      if (process.platform === 'win32') {
        execSync(`rmdir /S /Q "${dirPath}"`, { stdio: 'pipe' });
      } else {
        execSync(`rm -rf "${dirPath}"`, { stdio: 'pipe' });
      }
    } catch (e) {
      console.error(`[deleteDirRecursive] 系统命令删除失败: ${e.message}`);
    }
  }
  // 最终检查：如果目录仍存在，抛错让调用方知道删除失败
  if (fs.existsSync(dirPath)) {
    throw new Error(`无法删除目录: ${dirPath}（可能被其他进程占用）`);
  }
}

function sanitizeFilePath(filePath) {
  // 防止路径遍历：移除 ../ 和绝对路径
  // 仅保留相对路径部分，剥离盘符（Windows）和开头的反斜杠/正斜杠
  let cleaned = String(filePath || '')
    // 去掉 Windows 盘符前缀（如 C:）
    .replace(/^[a-zA-Z]:/, '')
    // 移除所有 .. 段（无论位置），防止跳出 sourceDir
    .replace(/\.\.(\/|\\|$)/g, '')
    // 去掉开头的分隔符
    .replace(/^[\/\\]+/, '');
  // path.normalize 处理多余的分隔符和 ./
  cleaned = path.normalize(cleaned).replace(/^[\/\\]+/, '');
  return cleaned;
}

// 校验拼接后的路径仍在 baseDir 内，防止路径遍历
function safeJoinPath(baseDir, filePath) {
  const cleaned = sanitizeFilePath(filePath);
  const resolved = path.resolve(baseDir, cleaned);
  const baseResolved = path.resolve(baseDir);
  // 必须在 baseDir 之内（含 baseDir 本身）
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
    return null; // 非法路径
  }
  return resolved;
}

// ============ 旧数据迁移 ============

function migrateLegacyUsers() {
  try {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

      const oldPath = path.join(DATA_DIR, entry.name);
      const userId = entry.name.replace(/\.json$/, '');
      const userDir = getUserDir(userId);
      const newPath = path.join(userDir, 'user.json');

      // 如果目标已存在则跳过，避免覆盖
      if (fs.existsSync(newPath)) continue;

      fs.mkdirSync(userDir, { recursive: true });
      fs.renameSync(oldPath, newPath);
      console.log(`Migrated legacy user data: ${entry.name} -> ${newPath}`);
    }
  } catch (e) {
    console.error('Migrate legacy users failed:', e.message);
  }
}

migrateLegacyUsers();

// ============ 用户数据持久化 API ============

function readUserData(userId) {
  return readJsonFile(getUserFilePath(userId));
}

function writeUserData(userId, data) {
  ensureUserDir(userId);
  writeJsonFile(getUserFilePath(userId), data);
}

// GET /api/users - 列出所有用户
app.get('/api/users', (req, res) => {
  try {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
    const users = entries
      .filter(e => e.isDirectory())
      .map(e => {
        const data = readJsonFile(path.join(DATA_DIR, e.name, 'user.json'));
        if (!data) return null;
        return { id: data.id, name: data.name, avatar: data.avatar, createdAt: data.createdAt };
      })
      .filter(Boolean);
    res.json(users);
  } catch (e) {
    res.json([]);
  }
});

// POST /api/users - 创建新用户
app.post('/api/users', (req, res) => {
  const { name, avatar } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '用户名不能为空' });
  }
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userData = {
    id,
    name: name.trim(),
    avatar: avatar || '🎓',
    createdAt: new Date().toISOString(),
    settings: null,
    learning: null,
  };
  writeUserData(id, userData);
  res.json(userData);
});

// GET /api/users/:id - 获取用户完整数据
app.get('/api/users/:id', (req, res) => {
  const data = readUserData(req.params.id);
  if (!data) return res.status(404).json({ error: '用户不存在' });
  res.json(data);
});

// PUT /api/users/:id - 更新用户数据
app.put('/api/users/:id', (req, res) => {
  const existing = readUserData(req.params.id);
  if (!existing) return res.status(404).json({ error: '用户不存在' });
  const updated = { ...existing, ...req.body, id: existing.id, createdAt: existing.createdAt };
  writeUserData(req.params.id, updated);
  res.json(updated);
});

// PUT /api/users/:id/settings - 仅更新 settings 部分
app.put('/api/users/:id/settings', (req, res) => {
  const existing = readUserData(req.params.id);
  if (!existing) return res.status(404).json({ error: '用户不存在' });
  existing.settings = req.body;
  writeUserData(req.params.id, existing);
  res.json(existing);
});

// PUT /api/users/:id/learning - 仅更新 learning 部分
app.put('/api/users/:id/learning', (req, res) => {
  const existing = readUserData(req.params.id);
  if (!existing) return res.status(404).json({ error: '用户不存在' });
  existing.learning = req.body;
  writeUserData(req.params.id, existing);
  res.json(existing);
});

// DELETE /api/users/:id - 删除用户
app.delete('/api/users/:id', (req, res) => {
  const userDir = getUserDir(req.params.id);
  if (fs.existsSync(userDir)) {
    deleteDirRecursive(userDir);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: '用户不存在' });
  }
});

// ============ API Key 安全存储 API ============
// 设计：明文存到 server/data/users/<userId>/apiKeys.json
// 前端只持有脱敏预览，调用 AI 时传 userId + modelId，后端查存储的明文 key 调上游
// 注意：modelId 作为 JSON key 存储，不做 safeId 转换（JSON key 可含任意字符如 "openai::gpt-4o"）
// 旧版数据可能用 safeId 后的 key 存储，读取时做兼容回退

// 从 apiKeys.json 中查找 modelId 对应的明文 key（兼容旧版 safeId 后的 key）
function lookupApiKey(keys, modelId) {
  if (!modelId) return undefined;
  // 优先用原始 modelId 查找
  if (keys[modelId]) return keys[modelId];
  // 兼容旧版：safeId 会去掉 ":" 等字符，如 "openai::gpt-4o" -> "openaigpt-4o"
  const legacyKey = safeId(modelId);
  if (legacyKey !== modelId && keys[legacyKey]) return keys[legacyKey];
  return undefined;
}

// PUT /api/users/:id/models/:modelId/apiKey - 保存（或更新）某个模型的 apiKey
// body: { apiKey: "sk-xxx" }
app.put('/api/users/:id/models/:modelId/apiKey', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return res.status(400).json({ error: 'apiKey 不能为空' });
  }

  const modelId = req.params.modelId;
  if (!modelId) return res.status(400).json({ error: 'modelId 非法' });

  const keys = readApiKeys(req.params.id);
  // 用原始 modelId 作为 key 存储（JSON key 可含 ":" 等字符）
  keys[modelId] = apiKey.trim();
  // 清理可能存在的旧版 safeId 后的 key（避免重复）
  const legacyKey = safeId(modelId);
  if (legacyKey !== modelId && keys[legacyKey]) {
    delete keys[legacyKey];
  }
  writeApiKeys(req.params.id, keys);

  // 只返回脱敏预览，不返回明文
  res.json({ success: true, preview: maskApiKey(apiKey) });
});

// GET /api/users/:id/models/:modelId/apiKey/preview - 获取某个模型 apiKey 的脱敏预览
app.get('/api/users/:id/models/:modelId/apiKey/preview', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const keys = readApiKeys(req.params.id);
  const key = lookupApiKey(keys, req.params.modelId);

  res.json({ hasKey: !!key, preview: key ? maskApiKey(key) : '' });
});

// DELETE /api/users/:id/models/:modelId/apiKey - 删除某个模型的 apiKey
app.delete('/api/users/:id/models/:modelId/apiKey', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const modelId = req.params.modelId;
  const keys = readApiKeys(req.params.id);
  let changed = false;
  if (keys[modelId]) { delete keys[modelId]; changed = true; }
  // 同时清理旧版 safeId 后的 key
  const legacyKey = safeId(modelId);
  if (legacyKey !== modelId && keys[legacyKey]) { delete keys[legacyKey]; changed = true; }
  if (changed) writeApiKeys(req.params.id, keys);
  res.json({ success: true });
});

// GET /api/users/:id/apiKeys - 批量获取所有模型的 apiKey 脱敏预览
// 返回 { "<modelId>": "sk-***...1234", ... }
app.get('/api/users/:id/apiKeys', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const keys = readApiKeys(req.params.id);
  const previews = {};
  for (const [modelId, key] of Object.entries(keys)) {
    previews[modelId] = maskApiKey(key);
  }
  res.json(previews);
});

// ============ 项目持久化 API ============

function generateProjectId() {
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function writeSourceFiles(userId, projectId, files) {
  const sourceDir = getProjectSourceDir(userId, projectId);
  if (!fs.existsSync(sourceDir)) {
    fs.mkdirSync(sourceDir, { recursive: true });
  }
  for (const file of files || []) {
    const fullPath = safeJoinPath(sourceDir, file.path);
    if (!fullPath) continue; // 非法路径直接跳过
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content || '', 'utf-8');
  }
}

function getFileTree(dirPath, basePath = '') {
  const result = [];
  if (!fs.existsSync(dirPath)) return result;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  // 排序：目录优先，同类按名称 localeCompare，保证文件树顺序稳定
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const entry of entries) {
    const relativePath = path.join(basePath, entry.name);
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      result.push({
        type: 'directory',
        path: relativePath.replace(/\\/g, '/'),
        children: getFileTree(fullPath, relativePath),
      });
    } else {
      result.push({
        type: 'file',
        path: relativePath.replace(/\\/g, '/'),
      });
    }
  }
  return result;
}

// POST /api/users/:id/projects - 创建/上传项目
app.post('/api/users/:id/projects', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const { name, displayName, description, language, files } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '项目名称不能为空' });
  }
  // 项目名白名单校验：禁止路径分隔符、通配符、控制字符等
  const trimmedName = name.trim();
  if (/[\\/:*?"<>|]/.test(trimmedName) || /[\x00-\x1f]/.test(trimmedName) || trimmedName.length > 100) {
    return res.status(400).json({ error: '项目名包含非法字符或过长' });
  }

  const projectId = generateProjectId();
  const projectDir = getProjectDir(req.params.id, projectId);
  fs.mkdirSync(projectDir, { recursive: true });

  const now = new Date().toISOString();
  const projectData = {
    id: projectId,
    name: name.trim(),
    displayName: (displayName || name).trim(),
    description: description || '',
    language: language || 'other',
    createdAt: now,
    updatedAt: now,
  };

  writeJsonFile(getProjectFilePath(req.params.id, projectId), projectData);
  writeSourceFiles(req.params.id, projectId, files);

  res.status(201).json(projectData);
});

// GET /api/users/:id/projects - 列出所有项目
app.get('/api/users/:id/projects', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const projectsDir = getProjectsDir(req.params.id);
  if (!fs.existsSync(projectsDir)) return res.json([]);

  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    const projects = entries
      .filter(e => e.isDirectory())
      .map(e => readJsonFile(path.join(projectsDir, e.name, 'project.json')))
      .filter(Boolean);
    res.json(projects);
  } catch (e) {
    res.json([]);
  }
});

// GET /api/users/:id/projects/:projectId - 获取项目元数据
app.get('/api/users/:id/projects/:projectId', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const project = readJsonFile(getProjectFilePath(req.params.id, req.params.projectId));
  if (!project) return res.status(404).json({ error: '项目不存在' });
  res.json(project);
});

// PUT /api/users/:id/projects/:projectId - 更新项目元数据
app.put('/api/users/:id/projects/:projectId', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const project = readJsonFile(getProjectFilePath(req.params.id, req.params.projectId));
  if (!project) return res.status(404).json({ error: '项目不存在' });

  // 校验传入的 name/displayName 不含非法字符
  const { name: newName, displayName: newDisplayName } = req.body;
  const invalidCharRegex = /[\\/:*?"<>|]|[\x00-\x1f]/;
  if (newName != null && invalidCharRegex.test(String(newName))) {
    return res.status(400).json({ error: '项目名包含非法字符' });
  }
  if (newDisplayName != null && invalidCharRegex.test(String(newDisplayName))) {
    return res.status(400).json({ error: '显示名包含非法字符' });
  }

  const updated = {
    ...project,
    ...req.body,
    id: project.id,
    createdAt: project.createdAt,
    updatedAt: new Date().toISOString(),
  };
  writeJsonFile(getProjectFilePath(req.params.id, req.params.projectId), updated);
  res.json(updated);
});

// DELETE /api/users/:id/projects/:projectId - 删除项目
app.delete('/api/users/:id/projects/:projectId', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const projectDir = getProjectDir(req.params.id, req.params.projectId);
  if (!fs.existsSync(projectDir)) {
    return res.status(404).json({ error: '项目不存在' });
  }
  try {
    deleteDirRecursive(projectDir);
    res.json({ success: true });
  } catch (e) {
    console.error(`[DELETE project] 删除失败: ${e.message}`);
    res.status(500).json({ error: `删除项目失败: ${e.message}` });
  }
});

// PUT /api/users/:id/projects/:projectId/analysis - 保存/更新 AI 分析
app.put('/api/users/:id/projects/:projectId/analysis', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const projectFilePath = getProjectFilePath(req.params.id, req.params.projectId);
  const project = readJsonFile(projectFilePath);
  if (!project) return res.status(404).json({ error: '项目不存在' });

  const analysis = {
    projectId: project.id,
    generatedAt: new Date().toISOString(),
    ...req.body,
  };
  writeJsonFile(getProjectAnalysisPath(req.params.id, req.params.projectId), analysis);

  project.updatedAt = new Date().toISOString();
  writeJsonFile(projectFilePath, project);

  res.json(analysis);
});

// GET /api/users/:id/projects/:projectId/analysis - 读取 AI 分析
app.get('/api/users/:id/projects/:projectId/analysis', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const analysis = readJsonFile(getProjectAnalysisPath(req.params.id, req.params.projectId));
  if (!analysis) return res.status(404).json({ error: '分析不存在' });
  res.json(analysis);
});

// PUT /api/users/:id/projects/:projectId/buildSteps - 保存构建步骤
app.put('/api/users/:id/projects/:projectId/buildSteps', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const projectFilePath = getProjectFilePath(req.params.id, req.params.projectId);
  const project = readJsonFile(projectFilePath);
  if (!project) return res.status(404).json({ error: '项目不存在' });

  const data = {
    projectId: project.id,
    savedAt: new Date().toISOString(),
    steps: req.body,
  };
  writeJsonFile(getProjectBuildStepsPath(req.params.id, req.params.projectId), data);
  res.json(data);
});

// GET /api/users/:id/projects/:projectId/buildSteps - 读取构建步骤
app.get('/api/users/:id/projects/:projectId/buildSteps', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const data = readJsonFile(getProjectBuildStepsPath(req.params.id, req.params.projectId));
  if (!data) return res.status(404).json({ error: '构建步骤不存在' });
  res.json(data);
});

// ============ AI 对话持久化 API ============

function getChatsFilePath(userId) {
  return path.join(getUserDir(userId), 'chats.json');
}

function readChats(userId) {
  const data = readJsonFile(getChatsFilePath(userId));
  // 兼容旧数据/空数据
  if (!data) return { sessions: [], currentSessionId: null };
  return {
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    currentSessionId: data.currentSessionId || null,
  };
}

function writeChats(userId, payload) {
  writeJsonFile(getChatsFilePath(userId), payload);
}

// GET /api/users/:id/chats - 读取所有会话
app.get('/api/users/:id/chats', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(readChats(req.params.id));
});

// PUT /api/users/:id/chats - 全量覆盖会话（前端做防抖批量同步）
app.put('/api/users/:id/chats', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const { sessions, currentSessionId } = req.body;
  if (!Array.isArray(sessions)) return res.status(400).json({ error: 'sessions 必须为数组' });
  writeChats(req.params.id, { sessions, currentSessionId: currentSessionId || null });
  res.json({ success: true });
});

// DELETE /api/users/:id/chats - 清空所有会话
app.delete('/api/users/:id/chats', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  writeChats(req.params.id, { sessions: [], currentSessionId: null });
  res.json({ success: true });
});

// ============ 阶段考试 API ============

function getExamsFilePath(userId) {
  return path.join(getUserDir(userId), 'exams.json');
}

function readExams(userId) {
  const data = readJsonFile(getExamsFilePath(userId));
  return (data && Array.isArray(data.exams)) ? data.exams : [];
}

function writeExams(userId, exams) {
  writeJsonFile(getExamsFilePath(userId), { exams });
}

function generateExamId() {
  return `exam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// GET /api/users/:id/exams - 列出所有考试
app.get('/api/users/:id/exams', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(readExams(req.params.id));
});

// POST /api/users/:id/exams - 创建考试
app.post('/api/users/:id/exams', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const { title, description, category, difficulty, questions } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: '考试标题不能为空' });
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: '至少需要一道题目' });
  }

  const now = new Date().toISOString();
  const exam = {
    id: generateExamId(),
    title: title.trim(),
    description: description || '',
    category: category || '通用',
    difficulty: difficulty || 'medium',
    questions: questions.map((q, i) => ({
      id: q.id || `q${i + 1}`,
      type: q.type || 'multiple_choice',
      question: q.question || '',
      options: Array.isArray(q.options) ? q.options : [],
      correctIndex: q.correctIndex !== undefined ? q.correctIndex : (q.correctAnswer !== undefined ? q.correctAnswer : 0),
      correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : (q.correctIndex !== undefined ? q.correctIndex : 0),
      explanation: q.explanation || '',
      points: typeof q.points === 'number' ? q.points : 10,
      // 简答题字段
      referenceAnswer: q.referenceAnswer || '',
      keywords: Array.isArray(q.keywords) ? q.keywords : [],
      // 代码实操题字段
      starterCode: q.starterCode || '',
      expectedOutput: q.expectedOutput || '',
      hint: q.hint || '',
    })),
    results: [],
    createdAt: now,
    updatedAt: now,
  };

  const exams = readExams(req.params.id);
  exams.push(exam);
  writeExams(req.params.id, exams);
  res.status(201).json(exam);
});

// GET /api/users/:id/exams/:examId - 获取考试详情
app.get('/api/users/:id/exams/:examId', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const exams = readExams(req.params.id);
  const exam = exams.find(e => e.id === req.params.examId);
  if (!exam) return res.status(404).json({ error: '考试不存在' });
  res.json(exam);
});

// PUT /api/users/:id/exams/:examId - 更新考试（或提交考试结果）
app.put('/api/users/:id/exams/:examId', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const exams = readExams(req.params.id);
  const idx = exams.findIndex(e => e.id === req.params.examId);
  if (idx === -1) return res.status(404).json({ error: '考试不存在' });

  const exam = exams[idx];

  // 如果是提交考试结果
  if (req.body.submitResult) {
    const { answers, timeSpent } = req.body;
    let score = 0;
    let totalPoints = 0;          // 客观题总分值（参与自动判分）
    let subjectivePoints = 0;     // 主观题总分值（不参与自动判分）
    const wrongQuestions = [];
    const subjectiveQuestions = [];

    for (const q of exam.questions) {
      const qType = q.type || 'multiple_choice';
      const isObjective = qType === 'multiple_choice' || qType === 'true_false';

      if (isObjective) {
        // 客观题：自动判分
        totalPoints += q.points;
        const userAnswer = answers[q.id];
        const correctAnswer = q.correctIndex !== undefined ? q.correctIndex : q.correctAnswer;
        if (userAnswer === correctAnswer) {
          score += q.points;
        } else {
          wrongQuestions.push({
            questionId: q.id,
            question: q.question,
            userAnswer,
            correctAnswer,
            explanation: q.explanation,
          });
        }
      } else {
        // 主观题（简答/代码实操）：不自动判分，记录用户答案与参考答案供自评
        subjectivePoints += q.points;
        subjectiveQuestions.push({
          questionId: q.id,
          type: qType,
          question: q.question,
          userAnswer: typeof answers[q.id] === 'string' ? answers[q.id] : '',
          referenceAnswer: q.referenceAnswer || '',
          starterCode: q.starterCode || '',
          expectedOutput: q.expectedOutput || '',
          hint: q.hint || '',
          keywords: Array.isArray(q.keywords) ? q.keywords : [],
          explanation: q.explanation || '',
          points: q.points,
        });
      }
    }

    const result = {
      takenAt: new Date().toISOString(),
      score,
      totalPoints,
      // percentage 只基于客观题自动判分部分
      percentage: totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0,
      timeSpent: timeSpent || 0,
      wrongCount: wrongQuestions.length,
      wrongQuestions,
      subjectiveQuestions,
      subjectivePoints,
    };

    exam.results = exam.results || [];
    exam.results.push(result);
    exam.updatedAt = new Date().toISOString();
    exams[idx] = exam;
    writeExams(req.params.id, exams);
    return res.json({ exam, result });
  }

  // 普通更新
  const updated = {
    ...exam,
    ...req.body,
    id: exam.id,
    createdAt: exam.createdAt,
    updatedAt: new Date().toISOString(),
    results: exam.results,  // 不允许通过普通更新覆盖结果
  };
  exams[idx] = updated;
  writeExams(req.params.id, exams);
  res.json(updated);
});

// DELETE /api/users/:id/exams/:examId - 删除考试
app.delete('/api/users/:id/exams/:examId', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const exams = readExams(req.params.id);
  const filtered = exams.filter(e => e.id !== req.params.examId);
  if (filtered.length === exams.length) {
    return res.status(404).json({ error: '考试不存在' });
  }
  writeExams(req.params.id, filtered);
  res.json({ success: true });
});

// GET /api/users/:id/projects/:projectId/files - 获取项目文件树
app.get('/api/users/:id/projects/:projectId/files', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const sourceDir = getProjectSourceDir(req.params.id, req.params.projectId);
  res.json(getFileTree(sourceDir));
});

// GET /api/users/:id/projects/:projectId/files/* - 读取单个文件内容
app.get('/api/users/:id/projects/:projectId/files/*', (req, res) => {
  const user = readUserData(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const sourceDir = getProjectSourceDir(req.params.id, req.params.projectId);
  const fullPath = safeJoinPath(sourceDir, req.params[0]);
  if (!fullPath) {
    return res.status(400).json({ error: '非法路径' });
  }
  const relativePath = path.relative(sourceDir, fullPath);

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return res.status(404).json({ error: '文件不存在' });
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  res.json({ path: relativePath.replace(/\\/g, '/'), content });
});

// 检测操作系统
function detectOS() {
  const platform = process.platform;
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

// 检测某个命令是否可用（异步）
async function checkCommand(command) {
  try {
    const osName = detectOS();
    const cmd = osName === 'windows' ? `where ${command}` : `which ${command}`;
    const r = await execAsync(cmd, { timeout: 3000 });
    return r.ok;
  } catch {
    return false;
  }
}

// 获取版本号（异步）
async function getVersion(command) {
  try {
    const r = await execAsync(`${command} --version`, { timeout: 5000 });
    return r.ok ? r.stdout.trim() : null;
  } catch {
    return null;
  }
}

// GET /api/env/check - 检测环境
app.get('/api/env/check', async (req, res) => {
  const nodeInstalled = await checkCommand('node');
  const gitInstalled = await checkCommand('git');
  const npmInstalled = await checkCommand('npm');

  res.json({
    os: detectOS(),
    node: {
      installed: nodeInstalled,
      version: nodeInstalled ? await getVersion('node') : null,
    },
    npm: {
      installed: npmInstalled,
      version: npmInstalled ? await getVersion('npm') : null,
    },
    git: {
      installed: gitInstalled,
      version: gitInstalled ? await getVersion('git') : null,
    },
  });
});

// POST /api/env/install - 安装环境（SSE 流式返回进度）
app.post('/api/env/install', (req, res) => {
  const { tool } = req.body; // 'node' | 'git'
  const os = detectOS();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // 安装命令映射 — 优先使用 Node.js (npm/npx) 实现跨平台
  const installCommands = {
    node: {
      windows: 'winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements',
      macos: 'brew install node@20',
      linux: 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs',
    },
    git: {
      windows: 'winget install Git.Git --accept-source-agreements --accept-package-agreements',
      macos: 'brew install git || xcode-select --install',
      linux: 'sudo apt-get update && sudo apt-get install -y git || sudo yum install -y git',
    },
  };

  const command = installCommands[tool]?.[os];
  if (!command) {
    sendEvent({ type: 'error', message: `不支持在 ${os} 上自动安装 ${tool}` });
    res.end();
    return;
  }

  sendEvent({ type: 'start', tool, os, command });

  const child = exec(command, { timeout: 300000 }, async (error, stdout, stderr) => {
    if (error) {
      sendEvent({ type: 'error', message: stderr || error.message, code: error.code });
    } else {
      // 安装完成后再检测一次
      const installed = await checkCommand(tool === 'node' ? 'node' : 'git');
      const version = installed ? await getVersion(tool === 'node' ? 'node' : 'git') : null;
      sendEvent({ type: 'done', tool, installed, version, stdout: stdout?.slice(-500) });
    }
    res.end();
  });

  // 实时输出
  if (child.stdout) {
    child.stdout.on('data', (data) => {
      sendEvent({ type: 'progress', tool, output: data.toString().slice(-200) });
    });
  }
  if (child.stderr) {
    child.stderr.on('data', (data) => {
      sendEvent({ type: 'progress', tool, output: data.toString().slice(-200) });
    });
  }

  // 客户端断开时杀掉进程
  req.on('close', () => {
    child.kill();
  });
});

// POST /api/env/detect-language - 检测特定语言环境
app.post('/api/env/detect-language', async (req, res) => {
  const { languageId } = req.body;

  const detectCommands = {
    python: '__python__',
    javascript: 'node --version',
    typescript: 'tsc --version',
    java: 'java -version 2>&1',
    cpp: 'g++ --version',
    go: 'go version',
    rust: 'rustc --version',
    swift: 'swift --version 2>&1',
    kotlin: 'kotlin -version 2>&1 || kotlinc -version 2>&1',
    ruby: 'ruby --version',
    php: 'php --version',
    csharp: 'dotnet --version',
    dart: 'dart --version 2>&1',
    scala: 'scala -version 2>&1 || scala --version 2>&1',
    sql: 'sqlite3 --version',
  };

  const command = detectCommands[languageId];
  if (!command) {
    return res.json({ installed: false, version: null, error: '未知语言' });
  }

  try {
    // Python 特殊处理：依次尝试 py/python/python3
    if (command === '__python__') {
      const pyResult = await detectPythonCmd();
      if (pyResult) {
        res.json({ installed: true, version: pyResult[1], error: null });
      } else {
        res.json({ installed: false, version: null, error: '未检测到 Python' });
      }
      return;
    }
    const r = await execAsync(command, { timeout: 10000 });
    if (r.ok) {
      res.json({ installed: true, version: r.stdout.trim(), error: null });
    } else {
      res.json({ installed: false, version: null, error: (r.stderr || '').trim() || '检测失败' });
    }
  } catch (e) {
    res.json({ installed: false, version: null, error: e.message });
  }
});

// POST /api/env/install-language - 安装特定语言环境（SSE）
app.post('/api/env/install-language', (req, res) => {
  const { languageId } = req.body;
  const os = detectOS();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // 安装命令映射 — 优先使用 Node.js (npm/npx) 实现跨平台安装
  // 策略：能用 npm/npx 的就用（跨平台），只有系统级工具才用平台包管理器
  const installCommands = {
    python: {
      windows: 'npm install -g pyright && pip install python',
      macos: 'brew install python@3.12',
      linux: 'sudo apt-get update && sudo apt-get install -y python3 python3-pip',
    },
    javascript: {
      windows: 'node --version || winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements',
      macos: 'node --version || brew install node@20',
      linux: 'node --version || (curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs)',
    },
    typescript: {
      windows: 'npm install -g typescript ts-node',
      macos: 'npm install -g typescript ts-node',
      linux: 'sudo npm install -g typescript ts-node',
    },
    java: {
      windows: 'npm install -g npm-jdk && npx npm-jdk install 21',
      macos: 'brew install openjdk@21',
      linux: 'sudo apt-get install -y openjdk-21-jdk',
    },
    cpp: {
      windows: 'npm install -g @aspect-build/aspect-cli || winget install MSYS2.MSYS2 --accept-source-agreements --accept-package-agreements',
      macos: 'xcode-select --install 2>/dev/null || true',
      linux: 'sudo apt-get install -y g++',
    },
    go: {
      windows: 'npm install -g go-npm && npx go-npm install',
      macos: 'brew install go',
      linux: 'sudo snap install go --classic || sudo apt-get install -y golang-go',
    },
    rust: {
      windows: 'npm install -g rustup-init || winget install Rustlang.Rustup --accept-source-agreements --accept-package-agreements',
      macos: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y',
      linux: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y',
    },
    ruby: {
      windows: 'npm install -g ruby-npm || winget install RubyInstallerTeam.Ruby.3.2 --accept-source-agreements --accept-package-agreements',
      macos: 'brew install ruby@3.2',
      linux: 'sudo apt-get install -y ruby-full',
    },
    php: {
      windows: 'npm install -g php-npm || winget install PHP.PHP.8.3 --accept-source-agreements --accept-package-agreements',
      macos: 'brew install php@8.3',
      linux: 'sudo apt-get install -y php',
    },
    csharp: {
      windows: 'npm install -g dotnet-npm || winget install Microsoft.DotNet.SDK.8 --accept-source-agreements --accept-package-agreements',
      macos: 'brew install dotnet@8',
      linux: 'sudo apt-get install -y dotnet-sdk-8.0',
    },
    dart: {
      windows: 'npm install -g dart-npm || winget install Dart.DartSDK --accept-source-agreements --accept-package-agreements',
      macos: 'brew install dart',
      linux: 'sudo apt-get install -y dart',
    },
    swift: {
      windows: 'winget install Swift.Toolchain --accept-source-agreements --accept-package-agreements',
      macos: 'xcode-select --install 2>/dev/null || true',
      linux: 'sudo apt-get install -y swift',
    },
    kotlin: {
      windows: 'npm install -g kotlin-compiler || winget install JetBrains.Kotlin --accept-source-agreements --accept-package-agreements',
      macos: 'brew install kotlin',
      linux: 'sudo snap install kotlin --classic || sudo apt-get install -y kotlin',
    },
    scala: {
      windows: 'npm install -g scala-cli || winget install Oracle.JDK.21 --accept-source-agreements --accept-package-agreements',
      macos: 'brew install scala',
      linux: 'sudo apt-get install -y scala',
    },
    sql: {
      windows: 'npm install -g sql.js-cli || winget install SQLite.SQLite --accept-source-agreements --accept-package-agreements',
      macos: 'brew install sqlite3',
      linux: 'sudo apt-get install -y sqlite3',
    },
  };

  const command = installCommands[languageId]?.[os];
  if (!command) {
    sendEvent({ type: 'error', message: `不支持在 ${os} 上自动安装 ${languageId}` });
    res.end();
    return;
  }

  sendEvent({ type: 'start', tool: languageId, os, command });

  const child = exec(command, { timeout: 600000 }, (error, stdout, stderr) => {
    if (error) {
      sendEvent({ type: 'error', message: stderr || error.message, code: error.code });
    } else {
      sendEvent({ type: 'done', tool: languageId, stdout: stdout?.slice(-500) });
    }
    res.end();
  });

  if (child.stdout) {
    child.stdout.on('data', (data) => {
      sendEvent({ type: 'progress', tool: languageId, output: data.toString().slice(-200) });
    });
  }
  if (child.stderr) {
    child.stderr.on('data', (data) => {
      sendEvent({ type: 'progress', tool: languageId, output: data.toString().slice(-200) });
    });
  }

  req.on('close', () => { child.kill(); });
});

// 获取本机局域网 IP
function getLanIp() {
  // 允许通过环境变量强制指定
  if (process.env.LAN_IP) return process.env.LAN_IP;

  const interfaces = os.networkInterfaces();

  // 常见真实局域网网段，按优先级排序
  const preferredPrefixes = ['192.168.100.', '192.168.1.', '192.168.0.', '10.'];

  // 常见虚拟网卡/虚拟网关网段，尽量避免
  const avoidedPrefixes = [
    '192.168.240.', // 你当前的虚拟网关
    '192.168.56.',  // VirtualBox 默认
    '192.168.159.', // VMware 常见
    '192.168.174.', // VMware 常见
    '192.168.204.', // VMware 常见
  ];

  // 1. 优先选择常见真实局域网网段
  for (const prefix of preferredPrefixes) {
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal && iface.address?.startsWith(prefix)) {
          return iface.address;
        }
      }
    }
  }

  // 2. 如果没有优先网段，返回第一个非虚拟网段的 IP
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address) {
        const isAvoided = avoidedPrefixes.some((prefix) => iface.address.startsWith(prefix));
        if (!isAvoided) return iface.address;
      }
    }
  }

  // 3. 兜底 localhost
  return 'localhost';
}

// 网络信息接口：供前端生成手机扫码连接二维码
app.get('/api/network', (req, res) => {
  const ip = getLanIp();
  res.json({
    ip,
    port: PORT,
    url: `http://${ip}:${PORT}`,
  });
});

// ============ AI 代理（解决浏览器 CORS 问题） ============

// POST /api/ai/chat - 代理转发到 OpenAI 兼容接口
// 支持 stream 模式（SSE）和非 stream 模式
// 安全改动：apiKey 不再从请求体接收，改为从后端存储查询（userId + modelId）
// 前端请求体需包含 { userId, modelId, baseUrl, model, messages, stream, ... }
app.post('/api/ai/chat', async (req, res) => {
  const { userId, modelId, baseUrl, model, messages, stream, temperature, maxTokens } = req.body;

  if (!userId || !modelId) {
    return res.status(400).json({ error: '缺少必要参数: userId, modelId（用于查询后端存储的 apiKey）' });
  }
  if (!baseUrl || !model || !messages) {
    return res.status(400).json({ error: '缺少必要参数: baseUrl, model, messages' });
  }

  // 从后端存储查询明文 apiKey（兼容旧版 safeId 后的 key）
  const keys = readApiKeys(userId);
  const apiKey = lookupApiKey(keys, modelId);
  if (!apiKey) {
    return res.status(400).json({ error: '未配置该模型的 API Key，请先在设置页录入' });
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body = {
    model,
    messages,
    stream: !!stream,
  };
  if (typeof temperature === 'number') body.temperature = temperature;
  // I4 修复：max_tokens 动态调整。某些模型（老版 GLM/早期 GPT）max_tokens 上限较低，
  // 设过大会被上游 400 拒绝。前端显式传入 maxTokens 时优先使用前端的值；
  // 否则按模型名粗略匹配默认值，未知模型保守用 8192
  if (typeof maxTokens === 'number') {
    body.max_tokens = maxTokens;
  } else {
    const lowerModel = String(model || '').toLowerCase();
    if (/glm-4v|glm-3|gpt-3\.5|qwen-7b|qwen-1\.8b|baichuan/.test(lowerModel)) {
      body.max_tokens = 4096;
    } else if (/glm-4|gpt-4|claude|qwen-72b|qwen-plus|deepseek/.test(lowerModel)) {
      body.max_tokens = 8192;
    } else {
      body.max_tokens = 8192;
    }
  }

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      // I7 修复：错误信息脱敏。上游错误可能包含 apiKey 提示或敏感内部信息，
      // 仅透传 status code 和简短 message，不返回原始 detail
      let shortMsg = `AI 接口返回错误: ${upstream.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson?.error?.message) shortMsg += ` - ${String(errJson.error.message).slice(0, 200)}`;
      } catch {
        // 非 JSON 错误，附加截断后的纯文本（最多 200 字符，且清除可能的 key 痕迹）
        const safe = errText.replace(/sk-[A-Za-z0-9]{10,}/g, 'sk-***').slice(0, 200);
        if (safe) shortMsg += ` - ${safe}`;
      }
      return res.status(upstream.status).json({ error: shortMsg });
    }

    if (stream) {
      // 流式：直接透传 SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let chunkCount = 0;
      let totalBytes = 0;
      let streamEndReason = 'unknown';
      const t0 = Date.now();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            streamEndReason = 'upstream_done';
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          chunkCount++;
          totalBytes += chunk.length;
          res.write(chunk);
        }
      } catch (e) {
        streamEndReason = `read_error: ${e.message}`;
        // 客户端断开或读取异常：尝试向前端发送错误事件
        try { res.write(`data: ${JSON.stringify({ error: 'upstream_stream_interrupted' })}\n\n`); } catch (_) {}
      }

      // 鲁棒性增强：如果上游 0 chunks 提前结束（200 但响应体为空），
      // 在 res.end() 之前向前端发送一个明确的错误事件，让前端能感知"上游没数据"
      if (chunkCount === 0 && streamEndReason === 'upstream_done') {
        try { res.write(`data: ${JSON.stringify({ error: 'upstream_empty_response' })}\n\n`); } catch (_) {}
      }

      try { res.end(); } catch (e) {
        streamEndReason = `end_error: ${e.message}`;
      }

      // 异常时记录诊断日志（chunks=0 或非正常结束），正常情况不输出避免日志噪音
      if (chunkCount === 0 || streamEndReason !== 'upstream_done') {
        console.warn(`[AI Chat] stream 异常结束: reason=${streamEndReason}, chunks=${chunkCount}, bytes=${totalBytes}, duration=${Date.now() - t0}ms, model=${model}, max_tokens=${body.max_tokens}`);
      }
    } else {
      const data = await upstream.json();
      res.json(data);
    }
  } catch (e) {
    try {
      if (!res.headersSent) {
        res.status(502).json({ error: `无法连接 AI 服务: ${e.message}`, url });
      } else {
        res.end();
      }
    } catch (_) {}
  }
});

// 服务前端静态文件（生产模式）
// dist 路径：优先用环境变量（Electron 打包后指向 resources/dist），开发模式用默认相对路径
const distPath = process.env.CM_DIST_DIR
  ? path.join(process.env.CM_DIST_DIR)
  : path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  // 对 index.html 禁用缓存，确保前端更新后客户端能拿到最新版本
  const noCache = (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
  }

  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        noCache(res)
      }
    }
  }));

  // SPA fallback: 所有非 API 路由返回 index.html
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api')) {
      noCache(res)
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      // 关键：API 路由必须放行，交给后面定义的路由处理
      next();
    }
  });
}

// ============ 考前速记 API ============

function getMemorizeDir(userId) {
  return path.join(getUserDir(userId), 'memorize', 'materials');
}

function getMemorizeFilePath(userId, materialId) {
  return path.join(getMemorizeDir(userId), `${safeId(materialId)}.json`);
}

// 列出所有资料
app.get('/api/users/:id/memorize/materials', (req, res) => {
  const dir = getMemorizeDir(req.params.id);
  if (!fs.existsSync(dir)) return res.json([]);
  try {
    const entries = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const materials = entries.map(f => {
      const data = readJsonFile(path.join(dir, f));
      if (!data) return null;
      // 列表只返回摘要，不含卡片详情
      return {
        id: data.id,
        title: data.title,
        fileType: data.fileType,
        aiSummary: data.aiSummary,
        createdAt: data.createdAt,
        cardCount: (data.cards || []).length,
      };
    }).filter(Boolean);
    res.json(materials);
  } catch (e) {
    res.json([]);
  }
});

// 获取单个资料详情（含卡片）
app.get('/api/users/:id/memorize/materials/:materialId', (req, res) => {
  const data = readJsonFile(getMemorizeFilePath(req.params.id, req.params.materialId));
  if (!data) return res.status(404).json({ error: '资料不存在' });
  res.json(data);
});

// 创建资料（含卡片，由前端 AI 生成后提交）
app.post('/api/users/:id/memorize/materials', (req, res) => {
  const { title, rawContent, fileType, aiSummary, cards } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: '标题不能为空' });

  const materialId = `mat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  // 为卡片分配 dayIndex（默认 7 天，每天 5-10 张）
  const cardsPerDay = 8;
  const cardsWithMeta = (cards || []).map((c, i) => ({
    id: `card-${materialId}-${i}`,
    front: c.front,
    back: c.back,
    tags: c.tags || [],
    status: 'new',
    reviewCount: 0,
    wrongCount: 0,
    dayIndex: Math.floor(i / cardsPerDay),
    nextReviewDate: today,
    lastReviewDate: '',
  }));

  const material = {
    id: materialId,
    userId: req.params.id,
    title: title.trim(),
    rawContent: rawContent || '',
    fileType: fileType || 'text',
    aiSummary: aiSummary || '',
    createdAt: now,
    cards: cardsWithMeta,
  };

  writeJsonFile(getMemorizeFilePath(req.params.id, materialId), material);
  res.status(201).json(material);
});

// 更新卡片状态（记住/再背一次）
app.put('/api/users/:id/memorize/materials/:materialId/cards/:cardId', (req, res) => {
  const filePath = getMemorizeFilePath(req.params.id, req.params.materialId);
  const material = readJsonFile(filePath);
  if (!material) return res.status(404).json({ error: '资料不存在' });

  const card = (material.cards || []).find(c => c.id === req.params.cardId);
  if (!card) return res.status(404).json({ error: '卡片不存在' });

  const { status } = req.body;
  card.status = status || card.status;
  card.reviewCount = (card.reviewCount || 0) + 1;
  // 确保字段存在（兼容旧数据）
  card.wrongCount = card.wrongCount || 0;
  // 点"我不会"时累计错误次数
  if (status === 'learning') {
    card.wrongCount = card.wrongCount + 1;
  }
  card.lastReviewDate = new Date().toISOString().slice(0, 10);

  // 艾宾浩斯复习周期：1/2/4/7 天
  const reviewDays = [1, 2, 4, 7];
  const nextDay = reviewDays[Math.min(card.reviewCount, reviewDays.length - 1)];
  const next = new Date();
  next.setDate(next.getDate() + nextDay);
  card.nextReviewDate = next.toISOString().slice(0, 10);

  if (status === 'mastered') {
    card.nextReviewDate = '';
  }

  writeJsonFile(filePath, material);
  res.json(card);
});

// 重置某天所有卡片为 new（用于"再来一轮"）
app.post('/api/users/:id/memorize/materials/:materialId/reset-day', (req, res) => {
  const filePath = getMemorizeFilePath(req.params.id, req.params.materialId);
  const material = readJsonFile(filePath);
  if (!material) return res.status(404).json({ error: '资料不存在' });

  const { dayIndex } = req.body;
  if (typeof dayIndex !== 'number') return res.status(400).json({ error: 'dayIndex 必填' });

  const today = new Date().toISOString().slice(0, 10);
  (material.cards || []).forEach(c => {
    if (c.dayIndex === dayIndex) {
      c.status = 'new';
      c.wrongCount = 0;
      c.nextReviewDate = today;
    }
  });

  writeJsonFile(filePath, material);
  res.json(material);
});

// 删除资料
app.delete('/api/users/:id/memorize/materials/:materialId', (req, res) => {
  const filePath = getMemorizeFilePath(req.params.id, req.params.materialId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: '资料不存在' });
  }
});

// ============ 代码执行 API ============

// 语言配置：文件扩展名 → 执行命令
const LANGUAGES = {
  python: { ext: '.py', cmd: 'python', args: (file) => [getPythonCmd(), [file]], detectCmd: '__python__' },
  javascript: { ext: '.js', cmd: 'node', args: (file) => ['node', [file]], detectCmd: 'node --version' },
  typescript: { ext: '.ts', cmd: 'npx', args: (file) => ['npx', ['tsx', file]], detectCmd: 'npx --version' },
  bash: { ext: '.sh', cmd: 'bash', args: (file) => ['bash', [file]], detectCmd: 'bash --version' },
  go: { ext: '.go', cmd: 'go', args: (file) => ['go', ['run', file]], detectCmd: 'go version' },
  ruby: { ext: '.rb', cmd: 'ruby', args: (file) => ['ruby', [file]], detectCmd: 'ruby --version' },
  php: { ext: '.php', cmd: 'php', args: (file) => ['php', [file]], detectCmd: 'php --version' },
  // 编译型语言用 shell 模式（编译 + 运行）
  java: { ext: '.java', cmd: 'java', args: (file) => ['java', [file]], detectCmd: 'java -version', shell: true, build: (file) => `javac "${file}" -d "${path.dirname(file)}" && java -cp "${path.dirname(file)}" ${path.basename(file, '.java')}` },
  cpp: { ext: '.cpp', cmd: 'g++', args: (file) => ['g++', [file]], detectCmd: 'g++ --version', shell: true, build: (file) => `g++ "${file}" -o "${file}.exe" && "${file}.exe"` },
  rust: { ext: '.rs', cmd: 'rustc', args: (file) => ['rustc', [file]], detectCmd: 'rustc --version', shell: true, build: (file) => `rustc "${file}" -o "${file}.exe" && "${file}.exe"` },
};

// Python 命令解析：优先 py launcher（系统级，不受 PATH 中文编码影响），fallback 到 python/python3
let _pythonCmd = null;
function getPythonCmd() {
  return _pythonCmd || 'python';
}
// 检测可用的 Python 命令，返回 [cmd, version] 或 null
async function detectPythonCmd() {
  for (const cmd of ['py', 'python', 'python3']) {
    try {
      const r = await execAsync(`${cmd} --version`, { timeout: 5000 });
      if (r.ok) {
        const version = r.stdout.trim().split('\n')[0] || r.stderr.trim().split('\n')[0];
        if (version) {
          _pythonCmd = cmd;
          return [cmd, version];
        }
      }
    } catch {}
  }
  _pythonCmd = null;
  return null;
}

// 检测本地可用语言（带缓存，5 分钟 TTL，异步不阻塞事件循环）
let _langCache = null;
let _langCacheTime = 0;
let _langDetecting = null; // 防止并发检测
async function detectAvailableLanguages() {
  const now = Date.now();
  if (_langCache && now - _langCacheTime < 300000) {
    return _langCache;
  }
  // 已有检测在进行中，复用同一个 Promise
  if (_langDetecting) return _langDetecting;

  _langDetecting = (async () => {
    const available = {};
    // 并行检测所有语言（每个 execAsync 都不会阻塞事件循环）
    const entries = Object.entries(LANGUAGES);
    const results = await Promise.all(
      entries.map(async ([lang, config]) => {
        try {
          // Python 特殊处理：依次尝试 py/python/python3
          if (config.detectCmd === '__python__') {
            const pyResult = await detectPythonCmd();
            return pyResult ? ['python', pyResult[1]] : null;
          }
          const detectCmd = config.detectCmd || `${config.cmd} --version`;
          const r = await execAsync(detectCmd, { timeout: 5000 });
          return r.ok ? [lang, r.stdout.trim().split('\n')[0] || r.stderr.trim().split('\n')[0]] : null;
        } catch {
          return null;
        }
      })
    );
    for (const item of results) {
      if (item) available[item[0]] = item[1];
    }
    _langCache = available;
    _langCacheTime = now;
    return available;
  })();

  try {
    return await _langDetecting;
  } finally {
    _langDetecting = null;
  }
}

// GET /api/execute/languages - 获取本地可用的编程语言
app.get('/api/execute/languages', async (req, res) => {
  const available = await detectAvailableLanguages();
  res.json(available);
});

// POST /api/execute - 执行代码
app.post('/api/execute', async (req, res) => {
  const { language, code, stdin } = req.body;

  if (!language || !code) {
    return res.status(400).json({ error: '缺少 language 或 code 参数' });
  }

  const config = LANGUAGES[language];
  if (!config) {
    return res.status(400).json({ error: `不支持的语言: ${language}` });
  }

  // 检查目标语言是否可用（只检查一个，不用全量检测）
  const available = await detectAvailableLanguages();
  if (!available[language]) {
    return res.status(400).json({ error: `${language} 运行环境未安装` });
  }

  // 创建临时目录
  const tmpDir = path.join(os.tmpdir(), 'codementor_exec');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const fileId = crypto.randomBytes(8).toString('hex');
  const fileName = `code_${fileId}${config.ext}`;
  const filePath = path.join(tmpDir, fileName);

  try {
    // 写入代码文件
    fs.writeFileSync(filePath, code, 'utf-8');

    const startTime = Date.now();

    // 统一环境变量：强制 UTF-8 编码，解决 Windows 下 GBK 编码导致的中文/emoji 报错
    const execEnv = {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
    };

    // 执行代码
    const result = await new Promise((resolve) => {
      let proc;
      if (config.build) {
        // 编译型语言：用 shell 执行 build 命令（编译 + 运行）
        const shellCmd = config.build(filePath);
        const shellExec = process.platform === 'win32' ? 'cmd' : 'sh';
        const shellFlag = process.platform === 'win32' ? '/c' : '-c';
        proc = spawn(shellExec, [shellFlag, shellCmd], {
          cwd: tmpDir,
          env: execEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          timeout: 10000,
        });
      } else {
        // 解释型语言：直接运行
        const [cmd, args] = config.args(filePath);
        proc = spawn(cmd, args, {
          cwd: tmpDir,
          env: execEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          timeout: 10000,
        });
      }

      let stdout = '';
      let stderr = '';

      // 发送 stdin
      if (stdin) {
        proc.stdin.write(stdin);
      }
      proc.stdin.end();

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        // 限制输出大小
        if (stdout.length > 102400) {
          proc.kill();
          stdout = stdout.slice(0, 102400) + '\n... (输出被截断，超过 100KB)';
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > 102400) {
          proc.kill();
          stderr = stderr.slice(0, 102400) + '\n... (错误输出被截断)';
        }
      });

      proc.on('error', (err) => {
        resolve({ stdout: '', stderr: err.message, exitCode: -1, signal: null });
      });

      proc.on('close', (exitCode, signal) => {
        resolve({ stdout, stderr, exitCode, signal });
      });

      // 超时强制终止
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 10000);
    });

    const execTime = Date.now() - startTime;

    // 清理临时文件
    try { fs.unlinkSync(filePath); } catch {}

    res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      signal: result.signal,
      execTime: `${execTime}ms`,
      success: result.exitCode === 0,
    });
  } catch (err) {
    // 清理临时文件
    try { fs.unlinkSync(filePath); } catch {}
    res.status(500).json({ error: `执行失败: ${err.message}` });
  }
});

// ============ 任务队列 API ============

// 内存任务队列（非持久化，重启后清空）
const taskQueue = new Map();

function createTask(userId, { type, title, projectId }) {
  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const task = {
    id,
    userId: safeId(userId),
    type: type || 'analysis',
    title: title || '未知任务',
    projectId: projectId || null,
    status: 'running', // running | completed | failed | interrupted
    progress: 0,
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  taskQueue.set(id, task);
  return task;
}

function updateTask(id, updates) {
  const task = taskQueue.get(id);
  if (!task) return null;
  Object.assign(task, updates, { updatedAt: new Date().toISOString() });
  return task;
}

function getTasksByUser(userId) {
  const uid = safeId(userId);
  return Array.from(taskQueue.values())
    .filter((t) => t.userId === uid)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

// 清理超过 1 小时的已完成任务
function cleanupOldTasks() {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  for (const [id, task] of taskQueue) {
    if (task.status !== 'running' && now - new Date(task.updatedAt).getTime() > ONE_HOUR) {
      taskQueue.delete(id);
    }
  }
}
setInterval(cleanupOldTasks, 10 * 60 * 1000); // 每 10 分钟清理一次

// 标记超过 30 分钟没更新的 running 任务为 interrupted
// 智谱 GLM 思考阶段可能 1-2 分钟无 chunk，5 分钟太短会误判
function markInterruptedTasks() {
  const now = Date.now();
  const THIRTY_MIN = 30 * 60 * 1000;
  for (const [id, task] of taskQueue) {
    if (task.status === 'running' && now - new Date(task.updatedAt).getTime() > THIRTY_MIN) {
      task.status = 'interrupted';
      task.error = '任务被异常中断（前端断开连接）';
      task.updatedAt = new Date().toISOString();
    }
  }
}
setInterval(markInterruptedTasks, 60 * 1000); // 每 60 秒检查一次

// 创建任务
app.post('/api/users/:id/tasks', (req, res) => {
  const { type, title, projectId } = req.body;
  const task = createTask(req.params.id, { type, title, projectId });
  res.json(task);
});

// 获取用户所有任务
app.get('/api/users/:id/tasks', (req, res) => {
  res.json(getTasksByUser(req.params.id));
});

// 获取单个任务
app.get('/api/users/:id/tasks/:taskId', (req, res) => {
  const task = taskQueue.get(req.params.taskId);
  if (!task || task.userId !== safeId(req.params.id)) return res.status(404).json({ error: '任务不存在' });
  res.json(task);
});

// 更新任务
app.put('/api/users/:id/tasks/:taskId', (req, res) => {
  const { status, progress, result, error, title } = req.body;
  const task = updateTask(req.params.taskId, { status, progress, result, error, title });
  if (!task) return res.status(404).json({ error: '任务不存在' });
  res.json(task);
});

// 删除任务
app.delete('/api/users/:id/tasks/:taskId', (req, res) => {
  taskQueue.delete(req.params.taskId);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`CodeMentor AI Backend running on http://localhost:${PORT}`);
});

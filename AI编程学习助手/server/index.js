const express = require('express');
const { exec, execSync } = require('child_process');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const DATA_DIR = path.join(__dirname, 'data', 'users');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============ 用户数据持久化 API ============

function getUserPath(userId) {
  // 防止路径遍历
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(DATA_DIR, `${safeId}.json`);
}

function readUserData(userId) {
  const filePath = getUserPath(userId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeUserData(userId, data) {
  const filePath = getUserPath(userId);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// GET /api/users - 列出所有用户
app.get('/api/users', (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    const users = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
        return { id: data.id, name: data.name, avatar: data.avatar, createdAt: data.createdAt };
      } catch {
        return null;
      }
    }).filter(Boolean);
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
  const filePath = getUserPath(req.params.id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: '用户不存在' });
  }
});

// 检测操作系统
function detectOS() {
  const platform = process.platform;
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

// 检测某个命令是否可用
function checkCommand(command) {
  try {
    const os = detectOS();
    const cmd = os === 'windows' ? `where ${command}` : `which ${command}`;
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// 获取版本号
function getVersion(command) {
  try {
    const result = execSync(`${command} --version`, { encoding: 'utf-8', stdio: 'pipe' });
    return result.trim();
  } catch {
    return null;
  }
}

// GET /api/env/check - 检测环境
app.get('/api/env/check', (req, res) => {
  const nodeInstalled = checkCommand('node');
  const gitInstalled = checkCommand('git');
  const npmInstalled = checkCommand('npm');

  res.json({
    os: detectOS(),
    node: {
      installed: nodeInstalled,
      version: nodeInstalled ? getVersion('node') : null,
    },
    npm: {
      installed: npmInstalled,
      version: npmInstalled ? getVersion('npm') : null,
    },
    git: {
      installed: gitInstalled,
      version: gitInstalled ? getVersion('git') : null,
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

  const child = exec(command, { timeout: 300000 }, (error, stdout, stderr) => {
    if (error) {
      sendEvent({ type: 'error', message: stderr || error.message, code: error.code });
    } else {
      // 安装完成后再检测一次
      const installed = checkCommand(tool === 'node' ? 'node' : 'git');
      const version = installed ? getVersion(tool === 'node' ? 'node' : 'git') : null;
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
app.post('/api/env/detect-language', (req, res) => {
  const { languageId } = req.body;

  const detectCommands = {
    python: 'python --version 2>&1 || python3 --version 2>&1',
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
    const result = execSync(command, { encoding: 'utf-8', stdio: 'pipe', timeout: 10000 });
    res.json({ installed: true, version: result.trim(), error: null });
  } catch (e) {
    res.json({ installed: false, version: null, error: e.stderr?.toString().trim() || e.message });
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

// 服务前端静态文件（生产模式）
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback: 所有非 API 路由返回 index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

app.listen(PORT, () => {
  console.log(`CodeMentor AI Backend running on http://localhost:${PORT}`);
});

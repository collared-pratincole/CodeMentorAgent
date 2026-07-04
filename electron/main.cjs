const { app, BrowserWindow, shell } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')

// 后端进程引用
let backendProcess = null
// 主窗口引用
let mainWindow = null

// 后端服务端口（动态选择，避免冲突）
const PORT = 3001

/**
 * 复制目录（递归），首次启动时把打包内置的示例数据复制到 userData
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      // 仅在目标不存在时复制，避免覆盖用户已有数据
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }
}

/**
 * 初始化数据目录：
 * - 打包后内置数据在 process.resourcesPath/data
 * - 用户可写数据目录在 app.getPath('userData')/data
 * - 首次启动时把内置数据复制到 userData（不覆盖已有数据）
 */
function initDataDir() {
  const userDataDir = app.getPath('userData')
  const userDataDataDir = path.join(userDataDir, 'data')
  // 开发模式下 resourcesPath 不存在或指向项目根，用 server/data 作为源
  const isDev = !app.isPackaged
  const sourceDataDir = isDev
    ? path.join(__dirname, '..', 'server', 'data')
    : path.join(process.resourcesPath, 'data')

  // 确保用户数据目录存在
  if (!fs.existsSync(userDataDataDir)) {
    fs.mkdirSync(userDataDataDir, { recursive: true })
  }

  // 首次启动：从内置数据复制到 userData（不覆盖已有文件）
  if (fs.existsSync(sourceDataDir)) {
    copyDirRecursive(sourceDataDir, userDataDataDir)
  }

  return userDataDataDir
}

/**
 * 启动后端服务
 */
function startBackend() {
  const isDev = !app.isPackaged
  const dataDir = initDataDir()

  // server/index.js 路径
  const serverPath = isDev
    ? path.join(__dirname, '..', 'server', 'index.js')
    : path.join(process.resourcesPath, 'server', 'index.js')

  // dist 目录路径（前端静态文件）
  const distDir = isDev
    ? path.join(__dirname, '..', 'dist')
    : path.join(process.resourcesPath, 'dist')

  // node 可执行文件路径（打包后用内置的 node）
  // Electron 打包后，server 作为子进程需要独立的 node 运行时
  // 方案：用 fork 方式启动，Electron 自带的 node 可执行文件可以通过 process.execPath 获取
  // 但 process.execPath 在打包后是 electron.exe，不是 node.exe
  // 所以打包时需要把 node.exe 一起打包，或者用 electron 的内置 node
  // 更稳妥的方案：用 child_process.fork（它会用当前 Node 运行时）
  const env = {
    ...process.env,
    CM_PORT: String(PORT),
    CM_DATA_DIR: dataDir,
    CM_DIST_DIR: distDir,
    CM_ELECTRON: '1',
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  }

  console.log('[Electron] 启动后端服务...')
  console.log('[Electron] serverPath:', serverPath)
  console.log('[Electron] dataDir:', dataDir)
  console.log('[Electron] distDir:', distDir)

  backendProcess = require('child_process').fork(serverPath, [], {
    env,
    silent: true,
    cwd: path.dirname(serverPath),
  })

  // 转发后端日志到主进程控制台
  backendProcess.stdout.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`)
  })
  backendProcess.stderr.on('data', (data) => {
    console.error(`[Backend Error] ${data.toString().trim()}`)
  })
  backendProcess.on('exit', (code, signal) => {
    console.log(`[Backend] 进程退出，code=${code} signal=${signal}`)
    backendProcess = null
  })
}

/**
 * 等待后端服务就绪（轮询 /api/health 或根路径）
 */
function waitForBackend(maxRetries = 60, interval = 500) {
  return new Promise((resolve, reject) => {
    let retries = 0
    const check = () => {
      const req = http.get(`http://localhost:${PORT}/`, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          resolve()
        } else {
          retry()
        }
        res.destroy()
      })
      req.on('error', () => retry())
      req.setTimeout(2000, () => {
        req.destroy()
        retry()
      })
    }
    const retry = () => {
      retries++
      if (retries >= maxRetries) {
        reject(new Error(`后端服务在 ${maxRetries * interval / 1000}s 内未就绪`))
        return
      }
      setTimeout(check, interval)
    }
    check()
  })
}

/**
 * 创建主窗口
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'CodeMentor AI',
    backgroundColor: '#FAF7F2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // 自定义标题栏样式（保留系统按钮，但让内容延伸到标题栏）
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
  })

  // 加载后端服务的前端页面
  mainWindow.loadURL(`http://localhost:${PORT}/`)

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('file://')) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 开发模式打开 DevTools
  if (!app.isPackaged) {
    // 不自动打开 DevTools，避免干扰
  }
}

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    startBackend()

    try {
      console.log('[Electron] 等待后端服务就绪...')
      await waitForBackend()
      console.log('[Electron] 后端服务已就绪，创建窗口')
      createWindow()
    } catch (err) {
      console.error('[Electron] 启动失败:', err.message)
      // 即使后端没就绪也尝试创建窗口，显示错误页面
      createWindow()
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    // 所有平台都退出（macOS 也退出，因为后端进程需要清理）
    app.quit()
  })

  app.on('before-quit', () => {
    // 清理后端进程
    if (backendProcess) {
      try {
        backendProcess.kill('SIGTERM')
      } catch {}
      // 强制清理
      setTimeout(() => {
        if (backendProcess) {
          try { backendProcess.kill('SIGKILL') } catch {}
        }
      }, 2000)
    }
  })
}

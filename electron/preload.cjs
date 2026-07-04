// preload.js
// 预加载脚本，运行在渲染进程之前，有受限的 Node.js 访问权限
// 通过 contextBridge 暴露安全的 API 给渲染进程

const { contextBridge } = require('electron')

// 当前只暴露最小化信息，未来可扩展（如版本号、自动更新等）
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
})

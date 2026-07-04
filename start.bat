@echo off
chcp 65001 >nul
echo =========================================
echo   CodeMentor AI - AI 编程导师
echo =========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo ❌ 未检测到 Node.js，请先安装: https://nodejs.org/
  pause
  exit /b 1
)

echo ✅ Node.js 已安装

if not exist "server\node_modules" (
  echo 📦 安装后端依赖...
  cd server && npm install --production && cd ..
)

if not exist "server\data\users" mkdir "server\data\users"

echo 🚀 启动 CodeMentor AI...
echo    访问 http://localhost:3001
echo.
echo 按 Ctrl+C 停止服务
echo.

cd server && node index.js

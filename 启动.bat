@echo off
chcp 65001 > nul
title CodeMentor-AI 启动器
setlocal

REM ============================================================
REM  CodeMentor-AI 一键启动脚本（Windows）
REM  - 自动检查依赖
REM  - 自动构建前端（若 dist 缺失或源码更新）
REM  - 启动后端服务并打开浏览器
REM ============================================================

cd /d "%~dp0"

echo.
echo ============================================================
echo   CodeMentor-AI 一键启动
echo ============================================================
echo.

REM ---- 1. 检查 Node.js ----
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 16+ 后再运行。
  echo        下载地址：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [1/4] Node.js 版本：%NODE_VER%

REM ---- 2. 检查并安装依赖 ----
if not exist "node_modules" (
  echo [2/4] 首次运行，正在安装依赖（npm install）...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
) else (
  echo [2/4] 依赖已就绪
)

REM ---- 3. 检查并构建前端 ----
REM 若 dist 不存在，或 src 比 dist 新，则重新构建
set NEED_BUILD=0
if not exist "dist\index.html" set NEED_BUILD=1

if %NEED_BUILD%==0 (
  REM 检查 src 目录下是否有比 dist 更新的 .ts/.tsx 文件（找到任一即跳出）
  for /r "src" %%f in (*.ts *.tsx) do (
    for %%d in ("dist\index.html") do (
      if "%%~tf" gtr "%%~td" (
        set NEED_BUILD=1
        goto :check_build
      )
    )
  )
)

:check_build
if %NEED_BUILD%==1 (
  echo [3/4] 正在构建前端（npm run build）...
  call npm run build
  if errorlevel 1 (
    echo [错误] 前端构建失败，请检查代码后重试。
    pause
    exit /b 1
  )
) else (
  echo [3/4] 前端已构建，跳过
)

REM ---- 4. 启动后端服务 ----
echo [4/4] 启动后端服务...
echo.
echo ============================================================
echo   服务地址：http://localhost:3001
echo   按 Ctrl+C 可停止服务
echo ============================================================
echo.

REM 延迟 2 秒后打开浏览器
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3001"

REM 前台运行服务（日志直接输出到本窗口）
node server/index.js

REM 服务退出后暂停，便于查看错误
echo.
echo 服务已停止。
pause

#!/bin/bash
# CodeMentor AI 启动脚本

echo "========================================="
echo "  CodeMentor AI - AI 编程导师"
echo "========================================="
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
  echo "❌ 未检测到 Node.js，请先安装: https://nodejs.org/"
  exit 1
fi

echo "✅ Node.js $(node --version)"

# 安装后端依赖
if [ ! -d "server/node_modules" ]; then
  echo "📦 安装后端依赖..."
  cd server && npm install --production && cd ..
fi

# 创建数据目录
mkdir -p server/data/users

# 启动服务
echo "🚀 启动 CodeMentor AI..."
echo "   访问 http://localhost:3001"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

cd server && node index.js

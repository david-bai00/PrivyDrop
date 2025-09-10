#!/bin/bash

# PrivyDrop Docker 部署快速测试脚本
# 这是对 docker/scripts/test-deployment.sh 的简化版本

echo "🧪 运行 PrivyDrop Docker 部署测试..."
echo ""

# 检查是否存在详细测试脚本
if [[ -f "docker/scripts/test-deployment.sh" ]]; then
    echo "📋 运行详细测试..."
    bash docker/scripts/test-deployment.sh
else
    echo "⚠️  详细测试脚本不存在，运行基础测试..."
    
    # 基础测试
    echo "🔍 检查容器状态..."
    docker-compose ps
    
    echo ""
    echo "🏥 检查健康状态..."
    
    # 检查后端健康
    if curl -f http://localhost:3001/health >/dev/null 2>&1; then
        echo "✅ 后端服务正常"
    else
        echo "❌ 后端服务异常"
    fi
    
    # 检查前端健康
    if curl -f http://localhost:3000/api/health >/dev/null 2>&1; then
        echo "✅ 前端服务正常"
    else
        echo "❌ 前端服务异常"
    fi
    
    echo ""
    echo "🔗 访问链接:"
    echo "   前端应用: http://localhost:3000"
    echo "   后端API: http://localhost:3001"
fi
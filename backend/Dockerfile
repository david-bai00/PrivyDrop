# 使用官方Node.js 18 Alpine镜像作为基础镜像
FROM node:18-alpine AS base

# 设置工作目录
WORKDIR /app

# 安装构建依赖和运行时工具
RUN apk add --no-cache \
    curl \
    dumb-init \
    && rm -rf /var/cache/apk/*

# 复制package文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 复制源代码
COPY . .

# 构建TypeScript代码
RUN npm run build

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001 -G nodejs

# 更改文件所有权
RUN chown -R backend:nodejs /app
USER backend

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# 使用dumb-init作为PID 1，处理信号
ENTRYPOINT ["dumb-init", "--"]

# 启动应用
CMD ["npm", "start"]
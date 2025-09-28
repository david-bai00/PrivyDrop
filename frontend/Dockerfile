# 多阶段构建 - 构建阶段
FROM node:18-alpine AS builder

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_TURN_HOST
ARG NEXT_PUBLIC_TURN_USERNAME
ARG NEXT_PUBLIC_TURN_PASSWORD

ENV http_proxy ${HTTP_PROXY} \
    https_proxy ${HTTPS_PROXY} \
    no_proxy ${NO_PROXY}

# 前端构建期注入可公开环境变量（用于客户端直连后端与 TURN）
ENV NEXT_PUBLIC_API_URL ${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_TURN_HOST ${NEXT_PUBLIC_TURN_HOST}
ENV NEXT_PUBLIC_TURN_USERNAME ${NEXT_PUBLIC_TURN_USERNAME}
ENV NEXT_PUBLIC_TURN_PASSWORD ${NEXT_PUBLIC_TURN_PASSWORD}

WORKDIR /app
# 复制package文件
COPY package*.json ./
COPY pnpm-lock.yaml ./

# 安装pnpm（使用npm，避免网络问题）
RUN npm install -g pnpm --no-audit --no-fund

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 设置环境变量
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

# 构建应用
RUN pnpm build

# 生产阶段
FROM node:18-alpine AS runner

WORKDIR /app

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# 复制构建产物
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY health-check.js ./

# 设置环境变量
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT 3002
ENV HOSTNAME "0.0.0.0"

USER nextjs

# 暴露端口
EXPOSE 3002

# 使用Node.js脚本做健康检查（替代curl）
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node health-check.js

# 启动应用
CMD ["node", "server.js"]
# 运行期保留公开变量（非必需，但便于服务端渲染读取）
ENV NEXT_PUBLIC_API_URL ${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_TURN_HOST ${NEXT_PUBLIC_TURN_HOST}
ENV NEXT_PUBLIC_TURN_USERNAME ${NEXT_PUBLIC_TURN_USERNAME}
ENV NEXT_PUBLIC_TURN_PASSWORD ${NEXT_PUBLIC_TURN_PASSWORD}

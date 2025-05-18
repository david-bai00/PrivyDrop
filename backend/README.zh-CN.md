# Privydrop - 后端

这是 Privydrop 的后端服务器，一个基于 WebRTC 的文件共享应用程序。它处理 WebRTC 连接的信令、房间管理、来自前端的 API 请求以及其他相关的后端逻辑。

## 功能特性

- **WebRTC 信令:** 使用 Socket.IO 交换 SDP offers、answers 和 ICE candidates，以促进点对点连接。
- **房间管理:** 允许用户创建和加入独特的房间进行文件共享会话。房间状态和参与者信息使用 Redis 进行管理。
- **API 端点:** 提供 HTTP API 供前端交互（例如，创建/加入房间、检查房间可用性）。
- **实时通信:** 使用 Socket.IO 实现客户端和服务器之间的即时消息传递。
- **速率限制:** 对某些操作进行基本的基于 IP 的速率限制，以防止滥用。
- **临时数据存储:** 利用 Redis 存储临时数据，如房间信息和会话详情，并具有自动过期功能。
- **来源跟踪:** 每日基础的流量来源（referrers）跟踪。

## 技术栈

- **Node.js:** JavaScript 运行时环境。
- **Express.js:** Node.js 的 Web 应用程序框架。
- **TypeScript:** JavaScript 的超集，用于静态类型检查。
- **Socket.IO:** 用于实时、双向、基于事件的通信库。
- **Redis:** 内存数据结构存储，用作缓存、会话管理和消息代理。
  - **ioredis:** Node.js 的一个健壮的 Redis 客户端。
- **CORS:** 用于启用跨域资源共享的中间件。
- **dotenv:** 用于从 `.env` 文件加载环境变量的模块。
- **PM2 (已提供 Ecosystem 文件):** Node.js 应用程序的生产流程管理器。
- **Docker:** 容器化平台。

## 项目结构

后端源代码主要位于 `src/` 目录中：
.
├── DEPLOYMENT.md
├── docker # Docker 相关文件 (Dockerfile, Nginx/TURN 配置等)。
│ ├── Dockerfile
│ ├── env_install.log
│ ├── Nginx
│ │ ├── configure.sh
│ │ ├── default
│ │ ├── nginx.conf
│ │ ├── renew_ssl.sh
│ │ └── stop_clean-log.sh
│ └── TURN
│ ├── configure.sh
│ ├── turnserver_development.conf
│ └── turnserver_production.conf
├── docs
│ ├── host_preparation.md
│ └── turn_nginx_notes.md
├── ecosystem.config.js
├── package.json
├── package-lock.json
├── readme.md
├── README.md
├── scripts
│ ├── del_logs.js
│ ├── export-tracking-data.js
│ └── redis-monitor.js
├── src
│ ├── config # 环境变量和服务器配置 (CORS)。
│ │ ├── env.ts
│ │ └── server.ts
│ ├── routes # API 路由定义 (Express 路由)。
│ │ └── api.ts
│ ├── server.ts # 主应用程序入口点：Express 服务器和 Socket.IO 设置。
│ ├── services # 核心业务逻辑 (房间管理, Redis 交互, 速率限制)。
│ │ ├── rateLimit.ts
│ │ ├── redis.ts
│ │ └── room.ts
│ ├── socket # Socket.IO 事件处理程序和信令逻辑。
│ │ └── handlers.ts
│ └── types # TypeScript 类型定义和接口。
│ ├── room.ts
│ └── socket.ts
└── tsconfig.json

## 先决条件

- Node.js (推荐 v18.x 或更高版本)
- npm 或 yarn
- 一个正在运行的 Redis 实例

## 环境变量

在 `backend/` 目录中创建一个 `.env.development.local` 文件用于本地开发（或为类生产环境创建 `.env.production.local` 文件）。用以下变量填充它：

```ini
# 服务器配置
PORT=3001
NODE_ENV=development # 或 production
CORS_ORIGIN=http://localhost:3000 # 你的前端应用程序 URL

# Redis 配置
REDIS_HOST=127.0.0.1 # 或者你的 Redis 服务器主机
REDIS_PORT=6379      # 或者你的 Redis 服务器端口
# REDIS_PASSWORD=your_redis_password # 可选：如果你的 Redis 受密码保护（代码需要调整才能使用）
```

**注意：** 如果未定义 `REDIS_HOST` 或 `REDIS_PORT`，应用程序将在启动时退出。

## 入门 (本地开发)

1.  **克隆仓库。**
2.  **导航到 `backend/` 目录：**
    ```bash
    cd path/to/your/project/privydrop/backend
    ```
3.  **安装依赖：**
    ```bash
    npm install
    # 或
    yarn install
    ```
4.  **确保 Redis 正在运行**，并且可以使用您在 `.env` 文件中提供的凭据进行访问。
5.  如上所述，**创建并配置您的 `.env.development.local` 文件**。
6.  **运行开发服务器：**
    ```bash
    npm run dev
    ```
    服务器应在您 `PORT` 环境变量指定的端口上启动（默认为 3001）。

## Docker 部署

1.  **导航到 `backend/` 目录。** (这假设您的 `Dockerfile` 位于 `backend/docker/Dockerfile`，但构建上下文是 `backend/`)
2.  **构建 Docker 镜像：**
    ```bash
    docker build -t privydrop-backend -f docker/Dockerfile .
    ```
3.  **运行 Docker 容器：**
    ```bash
    docker run -d \
      -p 3001:3001 \
      --name privydrop-backend-container \
      -e PORT=3001 \
      -e NODE_ENV=production \
      -e CORS_ORIGIN="http://your-frontend-domain.com" \
      -e REDIS_HOST="your-redis-host" \
      -e REDIS_PORT="your-redis-port" \
      privydrop-backend
    ```
    - 如果您的内部 `PORT` 不同或您想映射到不同的主机端口，请调整 `-p`。
    - 替换环境变量 (`-e`) 的占位符值。
    - 对于生产设置，您可能需要使用 Docker Compose，并可能将 Nginx 作为反向代理和 TURN 服务器运行。请参考 `backend/docker/nginx/` 和 `backend/docker/turn/` 目录中的配置（如果您按建议构建它们）以及可能的 `docker-compose.yml` 文件。

## API 端点

所有 API 端点都以 `/api` 为前缀。

- **`POST /api/create_room`**
  - 如果提供的 `roomId` 是唯一的，则创建一个新房间。
  - 请求体: `{ "roomId": "string" }`
  - 响应: `{ "success": boolean, "message": "string" }`
- **`GET /api/get_room`**
  - 生成一个唯一的、可用的房间 ID 并创建房间。
  - 响应: `{ "roomId": "string" }`
- **`POST /api/check_room`**
  - 检查给定的 `roomId` 是否可用（即不存在）。
  - 请求体: `{ "roomId": "string" }`
  - 响应: `{ "available": boolean }`
- **`POST /api/set_track`**
  - 跟踪一个来源事件。在 Redis 中存储每日统计信息，TTL 为 30 天。
  - 请求体: `{ "ref": "string", "timestamp": number, "path": "string" }`
  - 响应: `{ "success": boolean }`
- **`POST /api/logs_debug`** (用于前端调试)
  - 从前端接收日志消息并将其打印到服务器控制台。
  - 请求体: `{ "message": "string", "timestamp": number }`
  - 响应: `{ "success": boolean }`

## Socket.IO 事件

服务器侦听并发出以下 Socket.IO 事件，用于 WebRTC 信令和房间通信：

**客户端到服务器事件：**

- **`join`**: 客户端请求加入房间。
  - 数据: `{ roomId: string }`
- **`offer`**: 客户端向对等方发送 SDP offer。
  - 数据: `{ peerId: string, offer: RTCSessionDescriptionInit, from?: string }`
- **`answer`**: 客户端向对等方发送 SDP answer。
  - 数据: `{ peerId: string, answer: RTCSessionDescriptionInit, from?: string }`
- **`ice-candidate`**: 客户端向对等方发送 ICE candidate。
  - 数据: `{ peerId: string, candidate: RTCIceCandidateInit, from?: string }`
- **`initiator-online`**: (自定义) 发起者在房间内发出在线/就绪信号。
  - 数据: `{ roomId: string }`
- **`recipient-ready`**: (自定义) 接收者在房间内发出就绪信号。
  - 数据: `{ roomId: string, peerId: string }`

**服务器到客户端事件：**

- **`joinResponse`**: 对 `join` 请求的响应。
  - 数据: `{ success: boolean, message: string, roomId: string }`
- **`ready`**: 通知房间内的客户端有新的对等方加入并准备就绪。
  - 数据: `{ peerId: string }` (新对等方的 ID)
- **`offer`**: 将一个对等方的 SDP offer 转发给另一个对等方。
  - 数据: `{ offer: RTCSessionDescriptionInit, peerId: string }` (发送方的 ID)
- **`answer`**: 将一个对等方的 SDP answer 转发给另一个对等方。
  - 数据: `{ answer: RTCSessionDescriptionInit, peerId: string }` (发送方的 ID)
- **`ice-candidate`**: 将一个对等方的 ICE candidate 转发给另一个对等方。
  - 数据: `{ candidate: RTCIceCandidateInit, peerId: string }` (发送方的 ID)
- **`initiator-online`**: (自定义) 广播房间内发起者在线。
  - 数据: `{ roomId: string }`
- **`recipient-ready`**: (自定义) 广播接收者已准备就绪。
  - 数据: `{ peerId: string }` (准备就绪的接收者的 ID)
- **`peer-disconnected`**: 通知房间内的客户端有对等方断开连接。
  - 数据: `{ peerId: string }`

## Redis 数据使用摘要

Redis 用于：

- **房间信息 (`room:<roomId>` - Hash):** 存储房间创建时间。TTL 受管理。
- **房间内的套接字 (`room:<roomId>:sockets` - Set):** 存储房间内客户端的 `socketId`。TTL 与房间 TTL 绑定。
- **套接字到房间映射 (`socket:<socketId>` - String):** 将 `socketId` 映射到其 `roomId`。TTL 受管理。
- **速率限制 (`ratelimit:join:<ipAddress>` - Sorted Set):** 跟踪加入操作的基于 IP 的请求时间戳以进行速率限制。TTL 受管理。
- **来源跟踪 (`referrers:daily:<YYYY-MM-DD>` - Hash):** 存储每日来源计数。TTL 为 30 天。

## 贡献

(贡献指南占位符 - 例如：fork、branch、PR、编码标准)

## 许可证

(许可证占位符 - 例如：MIT、Apache 2.0)
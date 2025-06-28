# PrivyDrop - 后端

这是 PrivyDrop 的后端服务器。它使用 Node.js、Express 和 Socket.IO 构建，负责处理 WebRTC 连接的信令、房间管理和来自前端的 API 请求。

## ✨ 功能特性

- **WebRTC 信令:** 使用 Socket.IO 交换 SDP 和 ICE candidates。
- **房间管理:** 使用 Redis 高效地创建和管理临时文件共享房间。
- **轻量级 API:** 提供核心的 HTTP 接口供前端交互。
- **临时数据存储:** 所有房间数据在 Redis 中都有自动过期时间。

## 🛠️ 技术栈

- **运行时**: Node.js
- **框架**: Express.js
- **语言**: TypeScript
- **实时通信**: Socket.IO
- **数据库**: Redis (使用 ioredis 客户端)
- **进程管理**: PM2

## 🚀 入门 (本地开发)

1.  **先决条件**

    - Node.js (v18.x 或更高版本)
    - 一个正在运行的 Redis 实例

2.  **进入目录并安装依赖**

    ```bash
    cd backend
    npm install
    ```

3.  **配置环境变量**
    在 `backend/` 目录中创建一个 `.env.development.local` 文件，并填充以下变量：

    ```ini
    # 服务器配置
    BACKEND_PORT=3001
    CORS_ORIGIN=http://localhost:3002 # 前端开发服务器的 URL

    # Redis 配置
    REDIS_HOST=127.0.0.1
    REDIS_PORT=6379
    # REDIS_PASSWORD=your_redis_password
    ```

4.  **运行开发服务器**
    ```bash
    npm run dev
    ```
    服务器将在 `BACKEND_PORT` 环境变量指定的端口上启动（默认为 3001）。

## 📖 API 与事件摘要

本服务提供了一系列 API 端点和 Socket.IO 事件来支持前端功能。

- **API 端点**: 主要包括房间创建 (`/api/get_room`)、加入和检查等。
- **Socket.IO 事件**: 负责处理客户端加入房间 (`join`) 以及 WebRTC 信令的转发 (`offer`, `answer`, `ice-candidate`)。

## 📚 详细文档

- 要深入理解后端的代码结构、模块设计和 Redis 数据模型，请阅读 [**后端架构详解**](../docs/BACKEND_ARCHITECTURE.zh-CN.md)。
- 要了解项目前后端的整体协作方式，请参阅 [**项目整体架构**](../docs/ARCHITECTURE.zh-CN.md)。
- 有关生产环境的部署方法，请参考 [**部署指南**](../docs/DEPLOYMENT.zh-CN.md)。

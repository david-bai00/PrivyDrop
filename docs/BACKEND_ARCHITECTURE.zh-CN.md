# PrivyDrop - 后端架构详解

## 一、概述

### 1.1 核心职责

PrivyDrop 的后端是一个基于 Node.js 和 Express.js 的轻量级服务器。它的核心职责**并非直接传输文件**，而是作为 WebRTC 连接建立过程中的“**信令服务器**”和“**房间协调员**”。

主要功能包括：

- **HTTP API 服务**: 提供 RESTful 接口用于房间的创建、查询和状态检查。
- **WebRTC 信令**: 通过 Socket.IO 实时转发客户端之间的信令消息（SDP Offers/Answers, ICE Candidates），以促成 P2P 连接。
- **房间生命周期管理**: 使用 Redis 高效地管理房间和参与者的状态，并利用其 TTL 机制实现自动清理。
- **基础的安全性**: 实现了基于 IP 的速率限制以防止服务被滥用。

### 1.2 设计原则

- **无状态 (Stateless)**: 后端服务本身不持有任何与房间或用户相关的状态。所有状态都被委托给外部的 Redis 服务进行管理，这使得后端应用可以轻松地进行水平扩展。
- **轻量级信令**: 服务器仅作为信令消息的中转站，不解析也不存储信令内容，确保了端到端通信的隐私性。
- **高效率与低延迟**: 采用 Redis 作为内存数据库来管理房间状态，并通过 Socket.IO 进行实时通信，最大限度地降低了信令交换的延迟。
- **职责单一**: 每个模块（API、Socket 处理、Redis 服务）都有明确且单一的职责，易于理解、维护和测试。

## 二、项目结构

后端源代码遵循功能模块化的组织方式，主要位于 `src/` 目录中：

```
backend/
├── src/
│ ├── config/ # 环境变量和服务器配置 (CORS)
│ │ ├── env.ts
│ │ └── server.ts
│ ├── routes/ # API 路由定义 (Express 路由)
│ │ └── api.ts
│ ├── services/ # 核心业务逻辑 (房间, Redis, 速率限制)
│ │ ├── rateLimit.ts
│ │ ├── redis.ts
│ │ └── room.ts
│ ├── socket/ # Socket.IO 事件处理程序和信令逻辑
│ │ └── handlers.ts
│ ├── types/ # TypeScript 类型定义和接口
│ │ ├── room.ts
│ │ └── socket.ts
│ └── server.ts # 主应用程序入口点: Express 和 Socket.IO 设置
├── ecosystem.config.js # PM2 配置文件
├── package.json
└── tsconfig.json
```

## 三、核心模块详解

### 3.1 应用入口 (`src/server.ts`)

这是应用的启动文件。它负责：

1.  加载环境变量。
2.  初始化 Express 应用实例。
3.  配置 CORS、JSON 解析等中间件。
4.  挂载 `/api` 路由。
5.  创建 HTTP 服务器并附加 Socket.IO 服务。
6.  调用 `initializeSocketHandlers` 设置所有 Socket.IO 事件监听器。
7.  启动服务器并监听指定端口。

### 3.2 API 路由 (`src/routes/api.ts`)

定义了所有供前端调用的 HTTP RESTful API。

- **`POST /api/create_room`**: 接收前端指定的 `roomId`，检查是否可用，如果可用则创建新房间。
- **`GET /api/get_room`**: 生成一个唯一的、随机的房间 ID，创建房间后返回给前端。
- **`POST /api/check_room`**: 检查给定的 `roomId` 是否已存在。
- **`POST /api/set_track`**: 用于追踪流量来源。
- **`POST /api/logs_debug`**: 一个简单的调试端点，用于接收前端日志并打印在后端控制台。

### 3.3 Socket.IO 事件处理 (`src/socket/handlers.ts`)

这是信令交换的核心。`initializeSocketHandlers` 函数为传入的 `socket` 连接绑定了一系列事件处理器。

- **连接与断开**:
  - `connection`: 当一个新客户端连接时，记录其 `socket.id`。
  - `disconnect`: 当客户端断开时，从其所在的房间中移除，并通知房间内其他对等方 (`peer-disconnected`)。
- **房间逻辑**:
  - **`join`**: 处理客户端加入房间的请求。它会验证房间是否存在，并将该客户端的 `socket.id` 添加到房间的成员集合中，最后向请求方发送 `joinResponse`。
  - **`initiator-online`**: 由房间创建者（发起者）发出(当 web 被切到后台掉线时)，用于通知接收者“我已经上线了，准备重新建立连接”。
  - **`recipient-ready`**: 由接收者发出，通知房间内的发起者“准备就绪，可以开始重连”，这通常是触发 WebRTC `offer` 流程的信号。
- **WebRTC 信令转发**:
  - **`offer`**, **`answer`**, **`ice-candidate`**: 这三个事件是纯粹的信使，负责将一个对等方的 WebRTC 信令消息准确无误地转发给房间内的另一个对等方。

### 3.4 服务层 (`src/services/`)

封装了与外部依赖（如 Redis）和核心业务逻辑的交互。

- **`redis.ts`**: 提供了 Redis 客户端的单例实例。所有与 Redis 的交互都应通过此模块。
- **`room.ts`**: 封装了所有与房间相关的 Redis 操作。例如 `createRoom`, `isRoomExist`, `bindSocketToRoom` 等。它将业务逻辑（如“将用户添加到房间”）与底层 Redis 命令（如 `SADD`, `HSET`）解耦。
- **`rateLimit.ts`**: 实现了一个基于 IP 和 Redis Sorted Set 的速率限制器，用于限制用户在短时间内频繁创建或加入房间。

## 四、Redis 数据结构详解

Redis 是后端的关键组件，用于存储所有临时状态。我们巧妙地利用了不同的数据结构来满足业务需求，并为所有键设置了 TTL，以确保数据能自动清理。

- **1. 房间信息 (`Hash`)**:

  - **键模式**: `room:<roomId>` (例如: `room:ABCD12`)
  - **用途**: 存储房间的元数据。
  - **字段**:
    - `created_at`: 房间创建时的时间戳。
  - **示例**: `HSET room:ABCD12 created_at 1705123456789`

- **2. 房间内的套接字 (`Set`)**:

  - **键模式**: `room:<roomId>:sockets` (例如: `room:ABCD12:sockets`)
  - **用途**: 存储一个房间内所有客户端的 `socketId`。使用 Set 可以保证成员的唯一性，并方便地进行添加和删除。
  - **成员**: 客户端的 `socketId`。
  - **示例**: `SADD room:ABCD12:sockets "socketId_A" "socketId_B"`

- **3. 套接字到房间的映射 (`String`)**:

  - **键模式**: `socket:<socketId>` (例如: `socket:xgACY6QcQCojsOQaAAAB`)
  - **用途**: 将一个 `socketId` 反向映射到它所属的 `roomId`。这在处理客户端断开连接时非常有用，我们仅需 `socketId` 即可快速找到其房间并执行清理。
  - **值**: `roomId`。
  - **示例**: `SET socket:xgACY6QcQCojsOQaAAAB ABCD12`

- **4. 速率限制 (`Sorted Set`)**:

  - **键模式**: `ratelimit:join:<ipAddress>` (例如: `ratelimit:join:192.168.1.100`)
  - **用途**: 记录特定 IP 地址在指定时间窗口内的所有请求时间戳。
  - **成员**: `timestamp-randomNumber` (例如: `1678886400000-0.12345`)。使用随机数后缀确保同一毫秒内多个请求的唯一性。
  - **分数**: 请求的 Unix 时间戳（毫秒）。
  - **逻辑**: 通过 `ZREMRANGEBYSCORE` 移除时间窗口外的旧记录，再用 `ZCARD` 统计窗口内的请求数，从而判断是否超出限制。

- **5. 来源跟踪 (`Hash`)**:
  - **键模式**: `referrers:daily:<YYYY-MM-DD>` (例如: `referrers:daily:2023-03-15`)
  - **用途**: 按天统计不同来源（Referrer）的访问次数。
  - **字段**: 来源域名 (例如: `google.com`, `github.com`)。
  - **值**: 当天的累计访问次数。
  - **逻辑**: 使用 `HINCRBY` 命令原子性地增加指定来源的计数值。

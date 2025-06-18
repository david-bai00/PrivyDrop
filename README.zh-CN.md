# PrivyDrop(前 SecureShare) - 基于 WebRTC 的隐私安全文件分享工具

[![开源协议](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

<!--[![版本](https://img.shields.io/badge/version-1.0.0-brightgreen.svg)]()-->

PrivyDrop 是一个基于 WebRTC 的隐私文件分享工具，支持点对点（P2P）文件和文本传输，无需服务器中转，确保数据传输的隐私性和安全性。

[**在线体验 »**](https://www.securityshare.xyz/)

---

<!-- (可选) 在这里放一张项目截图或 GIF 动图 -->

![PrivyDrop 界面截图](frontend/public/HowItWorks.gif)

## ✨ 主要特性

- 🔒 **端到端加密**: 所有文件通过 WebRTC 在浏览器之间直接传输，不经过服务器。
- 📂 **文件/文件夹传输**: 支持多文件和整个文件夹的传输，文件夹会自动打包。
- ⚡ **实时高效**: 实时显示传输进度、自动计算传输速度。
- 📝 **富文本传输**: 支持在线编辑和发送格式化文本。
- 🔗 **便捷分享**: 通过链接或二维码轻松分享房间，建立连接。
- 📱 **多端支持**: 响应式设计，支持桌面和移动端浏览器。
- 🌐 **国际化**: 支持中文和英文界面。

## 🛠️ 技术栈

- **前端**: Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn/ui
- **后端**: Node.js, Express.js, TypeScript
- **实时通信**: WebRTC, Socket.IO
- **数据存储**: Redis
- **部署**: PM2, Nginx, Docker[暂未支持]

## 🚀 快速上手 (本地全栈开发)

在开始之前，请确保你的开发环境已安装 [Node.js](https://nodejs.org/) (v18+), [npm](https://www.npmjs.com/) 以及一个正在运行的 [Redis](https://redis.io/) 实例。

1.  **克隆项目**

    ```bash
    git clone https://github.com/david-bai00/PrivyDrop.git
    cd privydrop
    ```

2.  **配置并启动后端服务**

    ```bash
    cd backend
    npm install

    # 根据 backend/README.zh-CN.md 指引创建并配置 .env.development.local

    npm run dev # 默认启动于 http://localhost:3001
    ```

3.  **配置并启动前端应用** (在新的终端窗口中)

    ```bash
    cd frontend
    pnpm install

    # 根据 frontend/README.zh-CN.md 指引创建并配置 .env.development.local

    pnpm dev # 默认启动于 http://localhost:3000
    ```

4.  **开始使用**
    在浏览器中打开 `http://localhost:3000` 即可访问应用。

## 📚 文档

我们提供了详尽的文档来帮助你深入了解项目的设计和部署细节：

- [**项目整体架构**](./docs/ARCHITECTURE.zh-CN.md): 了解系统各个组件如何协同工作。
- [**前端架构详解**](./docs/FRONTEND_ARCHITECTURE.zh-CN.md): 深入探索前端的代码结构、状态管理和核心逻辑。
- [**后端架构详解**](./docs/BACKEND_ARCHITECTURE.zh-CN.md): 深入探索后端的代码结构、信令流程和 Redis 设计。
- [**部署指南**](./docs/DEPLOYMENT.zh-CN.md): 学习如何在生产环境部署完整的 PrivyDrop 应用。

## 🤝 参与贡献

我们欢迎任何形式的贡献！无论是报告 Bug、提出功能建议还是提交代码，都对我们帮助巨大。请阅读我们的 [**贡献指南**](./.github/CONTRIBUTING.md) 来开始你的贡献之旅。

## 📄 开源协议

本项目采用 MIT 协议，详情请见 [LICENSE](./LICENSE) 文件。

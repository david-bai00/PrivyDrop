# PrivyDrop - 基于 WebRTC 的隐私安全文件分享工具

[![开源协议](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

PrivyDrop (原 SecureShare) 是一个基于 WebRTC 的开源点对点（P2P）文件和文本分享工具。它无需服务器中转，所有数据在浏览器之间直接传输，确保端到端加密，为你提供极致的隐私安全保障。

我们相信，每个人都应掌控自己的数据。PrivyDrop 的诞生就是为了实现这一愿景：一个简单、快速、私密的分享解决方案。

[**在线体验 »**](https://www.privydrop.app/) | [**GitHub 仓库 »**](https://github.com/david-bai00/PrivyDrop)

---

![PrivyDrop 界面截图](frontend/public/HowItWorks.gif)

## ✨ 主要特性

- 🔒 **端到端加密**: 基于 WebRTC 的 P2P 直连技术，所有文件和文本在浏览器间直接传输，不经过任何中央服务器。
- 📂 **文件与文件夹传输**: 支持多文件和整个文件夹的传输。
- ⚡ **实时高效**: 实时显示传输进度、自动计算传输速度。
- 📝 **富文本剪贴板**: 支持在线编辑和发送格式化文本，不仅仅是文件。
- 🔗 **便捷分享**: 通过链接或二维码轻松分享房间，建立连接。
- 📱 **多端支持**: 响应式设计，支持桌面和移动端浏览器。
- 🌐 **国际化**: 支持中文、英文等多个语言。

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

## 🗺️ 路线图

我们制定了一份公开的路线图，其中概述了项目的未来愿景和当前的工作重点。你可以通过它了解我们正在进行的工作，或是寻找可以贡献力量的地方。

➡️ **[查看项目路线图](./ROADMAP.zh-CN.md)**

## 📚 文档

我们提供了详尽的文档来帮助你深入了解项目的设计和部署细节：

- [**项目整体架构**](./docs/ARCHITECTURE.zh-CN.md): 了解 PrivyDrop 系统各个组件如何协同工作。
- [**前端架构详解**](./docs/FRONTEND_ARCHITECTURE.zh-CN.md): 深入探索前端的代码结构、状态管理和核心逻辑。
- [**后端架构详解**](./docs/BACKEND_ARCHITECTURE.zh-CN.md): 深入探索后端的代码结构、信令流程和 Redis 设计。
- [**部署指南**](./docs/DEPLOYMENT.zh-CN.md): 学习如何在生产环境部署完整的 PrivyDrop 应用。

## 🤝 参与贡献

我们热烈欢迎任何形式的贡献！无论是报告 Bug、提出功能建议、提交代码还是加星，都对 PrivyDrop 的成长帮助巨大。请阅读我们的 [**贡献指南**](./.github/CONTRIBUTING.zh-CN.md) 来开始你的贡献之旅。

我们制定了所有贡献者都应遵守的 [**行为准则**](./.github/CODE_OF_CONDUCT.zh-CN.md)，请在参与前仔细阅读。

## 📄 开源协议

本项目采用 MIT 协议，详情请见 [LICENSE](./LICENSE) 文件。

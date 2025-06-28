# PrivyDrop - 前端

这是 PrivyDrop 的前端部分，一个使用 Next.js 构建的、基于 WebRTC 的隐私文件分享应用。

## 🛠️ 技术栈

- **前端框架**: Next.js 14 (App Router)
- **UI 框架**: React 18 + TypeScript
- **样式**: Tailwind CSS + shadcn/ui
- **P2P 传输**: WebRTC
- **信令服务客户端**: Socket.IO Client
- **国际化**: next-intl

## 🚀 本地开发

开始前，请确保你已经根据项目根目录 `README.md` 的指引，**安装并启动了后端服务**。

1.  **进入目录**
    ```bash
    # 假设你当前在项目根目录
    cd frontend
    ```
2.  **安装依赖**
    ```bash
    pnpm install
    ```
3.  **配置环境变量**
    在 `frontend/` 目录下创建 `.env.development.local` 文件，并填入开发所需的环境变量，至少需要指定后端 API 的地址：
    ```ini
    NEXT_PUBLIC_API_URL=http://localhost:3001
    ```
4.  **启动开发服务器**
    ```bash
    pnpm dev
    ```
5.  在浏览器中打开 `http://localhost:3002` 即可看到应用界面。

## 📚 详细文档

- 要了解完整的项目架构和组件协作方式，请参阅 [**项目整体架构**](../docs/ARCHITECTURE.zh-CN.md)。
- 要深入理解前端的代码结构、Hooks 设计和状态管理，请阅读 [**前端架构详解**](../docs/FRONTEND_ARCHITECTURE.zh-CN.md)。
- 有关生产环境的部署方法，请参考 [**部署指南**](../docs/DEPLOYMENT.zh-CN.md)。

## 🤝 参与贡献

我们欢迎任何形式的贡献！请阅读根目录下的 [**贡献指南**](../.github/CONTRIBUTING.zh-CN.md) 来开始。

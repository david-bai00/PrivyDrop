# PrivyDrop - Frontend

This is the frontend for PrivyDrop, a privacy-focused file sharing application built with Next.js and based on WebRTC.

## 🛠️ Tech Stack

- **Frontend Framework**: Next.js 14 (App Router)
- **UI Framework**: React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **P2P Transport**: WebRTC
- **Signaling Service Client**: Socket.IO Client
- **Internationalization**: next-intl

## 🚀 Local Development

Before you start, please ensure you have **installed and started the backend service** according to the instructions in the project's root `README.md`.

1.  **Navigate to the Directory**
    ```bash
    # Assuming you are in the project's root directory
    cd frontend
    ```
2.  **Install Dependencies**
    ```bash
    pnpm install
    ```
3.  **Configure Environment Variables**
    First, copy the environment variable configuration from the template file:
    ```bash
    cp .env_development_example .env.development
    ```
    Then, open and edit the `.env.development` file, ensuring that `NEXT_PUBLIC_API_URL` points to your locally running backend service.

4.  **Start the Development Server**
    ```bash
    pnpm dev
    ```
5.  Open `http://localhost:3002` in your browser to see the application.

## 📚 Detailed Documentation

- To understand the complete project architecture and how components collaborate, please see the [**Overall Project Architecture**](../docs/ARCHITECTURE.md).
- To dive deep into the frontend's code structure, Hooks design, and state management, please read the [**Frontend Architecture Deep Dive**](../docs/FRONTEND_ARCHITECTURE.md).
- For instructions on deploying in a production environment, please refer to the [**Deployment Guide**](../docs/DEPLOYMENT.md).

## 🤝 Contributing

We welcome all forms of contributions! Please read the [**Contribution Guidelines**](../.github/CONTRIBUTING.md) in the root directory to get started.

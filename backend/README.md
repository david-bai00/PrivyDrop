# PrivyDrop - Backend

This is the backend server for PrivyDrop. It is built with Node.js, Express, and Socket.IO, and is responsible for handling WebRTC connection signaling, room management, and API requests from the frontend.

## ✨ Features

- **WebRTC Signaling:** Uses Socket.IO to exchange SDP and ICE candidates.
- **Room Management:** Efficiently creates and manages temporary file-sharing rooms using Redis.
- **Lightweight API:** Provides core HTTP endpoints for frontend interaction.
- **Temporary Data Storage:** All room data in Redis has an automatic expiration time (TTL).

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Real-time Communication**: Socket.IO
- **Database**: Redis (using the ioredis client)
- **Process Management**: PM2

## 🚀 Getting Started (Local Development)

1.  **Prerequisites**

    - Node.js (v18.x or newer)
    - A running Redis instance

2.  **Navigate to Directory and Install Dependencies**

    ```bash
    cd backend
    npm install
    ```

3.  **Configure Environment Variables**
    First, copy the environment variable configuration from the template file:
    ```bash
    cp .env_development_example .env.development
    ```
    Then, open and edit the `.env.development` file to match your local Redis and frontend configuration.

4.  **Run the Development Server**
    ```bash
    npm run dev
    ```
    The server will start on the port specified by the `BACKEND_PORT` environment variable (defaults to 3001).

## 📖 API & Event Summary

This service provides a set of API endpoints and Socket.IO events to support the frontend application.

- **API Endpoints**: Primarily include room creation (`/api/get_room`), joining, and checking.
- **Socket.IO Events**: Responsible for handling clients joining rooms (`join`) and forwarding WebRTC signaling messages (`offer`, `answer`, `ice-candidate`).

## 📚 Detailed Documentation

- To understand the backend's code structure, module design, and Redis data model in depth, please read the [**Backend Architecture Deep Dive**](../docs/BACKEND_ARCHITECTURE.md).
- To learn about how the frontend and backend collaborate, refer to the [**Overall Project Architecture**](../docs/ARCHITECTURE.md).
- For instructions on deploying in a production environment, please see the [**Deployment Guide**](../docs/DEPLOYMENT.md).

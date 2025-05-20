# Privydrop - Backend

This is the backend server for Privydrop, a WebRTC-based file-sharing application. It handles signaling for WebRTC connections, room management, API requests from the frontend, and other related backend logic.

## Features

- **WebRTC Signaling:** Uses Socket.IO to exchange SDP offers, answers, and ICE candidates to facilitate peer-to-peer connections.
- **Room Management:** Allows users to create and join unique rooms for file-sharing sessions. Room state and participant information are managed using Redis.
- **API Endpoints:** Provides HTTP APIs for frontend interaction (e.g., creating/joining rooms, checking room availability).
- **Real-time Communication:** Uses Socket.IO for instant messaging between clients and the server.
- **Rate Limiting:** Basic IP-based rate limiting on certain operations to prevent abuse.
- **Temporary Data Storage:** Utilizes Redis to store temporary data like room information and session details with automatic expiration.
- **Referrer Tracking:** Daily tracking of traffic sources (referrers).

## Tech Stack

- **Node.js:** JavaScript runtime environment.
- **Express.js:** Web application framework for Node.js.
- **TypeScript:** Superset of JavaScript for static type checking.
- **Socket.IO:** Library for real-time, bidirectional, event-based communication.
- **Redis:** In-memory data structure store, used as a cache, session manager, and message broker.
  - **ioredis:** A robust Redis client for Node.js.
- **CORS:** Middleware for enabling Cross-Origin Resource Sharing.
- **dotenv:** Module for loading environment variables from an `.env` file.
- **PM2 (Ecosystem file provided):** Production process manager for Node.js applications.

## Project Structure

The backend source code is primarily located in the `src/` directory:
.
├── README.md
├── README.zh-CN.md
├── docker # Docker-related files (Dockerfile, Nginx/TURN configurations, etc.).
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
│ ├── DEPLOYMENT_GUIDE.en-US.md
│ └── DEPLOYMENT_GUIDE.zh-CN.md
├── ecosystem.config.js
├── package.json
├── package-lock.json
├── scripts
│ ├── del_logs.js
│ ├── export-tracking-data.js
│ └── redis-monitor.js
├── src
│ ├── config # Environment variables and server configuration (CORS).
│ │ ├── env.ts
│ │ └── server.ts
│ ├── routes # API route definitions (Express routes).
│ │ └── api.ts
│ ├── server.ts # Main application entry point: Express server and Socket.IO setup.
│ ├── services # Core business logic (room management, Redis interaction, rate limiting).
│ │ ├── rateLimit.ts
│ │ ├── redis.ts
│ │ └── room.ts
│ ├── socket # Socket.IO event handlers and signaling logic.
│ │ └── handlers.ts
│ └── types # TypeScript type definitions and interfaces.
│ ├── room.ts
│ └── socket.ts
└── tsconfig.json

## Prerequisites

- Node.js (v18.x or later recommended)
- npm or yarn
- A running Redis instance

For detailed installation and configuration of dependency services (like Redis, TURN/STUN server) and production deployment guidelines, please refer to the [Deployment Guide](./docs/DEPLOYMENT_GUIDE.en-US.md).

## Environment Variables

The application relies on environment variables to run. A simplified local development environment configuration is as follows:

Create a `.env.development.local` file in the `backend/` directory and populate it with the following basic variables:

```ini
# Server Configuration
PORT=3001
NODE_ENV=development # or production
CORS_ORIGIN=http://localhost:3000 # Your frontend application URL

# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_PASSWORD=your_redis_password # Uncomment and set if your Redis is password-protected
```

**Note:**

- If `REDIS_HOST` or `REDIS_PORT` are not defined, the application will exit on startup.
- For more comprehensive environment variable configurations (including TURN server, production-specific settings, etc.), please refer to Section 4.3 of the [Deployment Guide](./docs/DEPLOYMENT_GUIDE.en-US.md).

## Getting Started (Local Development)

1.  **Clone the repository.**
2.  **Navigate to the `backend/` directory:**
    ```bash
    cd path/to/your/project/privydrop/backend
    ```
3.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
4.  **Ensure Redis is running** and accessible with the credentials provided in your `.env` file. For detailed Redis installation and configuration, refer to Section 3.1 of the [Deployment Guide](./docs/DEPLOYMENT_GUIDE.en-US.md).
5.  **Create and configure your `.env.development.local` file** as described above.
6.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The server should start on the port specified by your `PORT` environment variable (defaults to 3001).

For **production deployment**, please refer to the detailed instructions on using PM2 in the [Deployment Guide](./docs/DEPLOYMENT_GUIDE.en-US.md) (Section 4.5).

## API Endpoints

All API endpoints are prefixed with `/api`.

- **`POST /api/create_room`**
  - Creates a new room if the provided `roomId` is unique.
  - Request Body: `{ "roomId": "string" }`
  - Response: `{ "success": boolean, "message": "string" }`
- **`GET /api/get_room`**
  - Generates a unique, available room ID and creates the room.
  - Response: `{ "roomId": "string" }`
- **`POST /api/check_room`**
  - Checks if the given `roomId` is available (i.e., does not exist).
  - Request Body: `{ "roomId": "string" }`
  - Response: `{ "available": boolean }`
- **`POST /api/set_track`**
  - Tracks a referrer event. Stores daily stats in Redis with a 30-day TTL.
  - Request Body: `{ "ref": "string", "timestamp": number, "path": "string" }`
  - Response: `{ "success": boolean }`
- **`POST /api/logs_debug`** (For frontend debugging)
  - Receives log messages from the frontend and prints them to the server console.
  - Request Body: `{ "message": "string", "timestamp": number }`
  - Response: `{ "success": boolean }`

## Socket.IO Events

The server listens for and emits the following Socket.IO events for WebRTC signaling and room communication:

**Client-to-Server Events:**

- **`join`**: Client requests to join a room.
  - Data: `{ roomId: string }`
- **`offer`**: Client sends an SDP offer to a peer.
  - Data: `{ peerId: string, offer: RTCSessionDescriptionInit, from?: string }`
- **`answer`**: Client sends an SDP answer to a peer.
  - Data: `{ peerId: string, answer: RTCSessionDescriptionInit, from?: string }`
- **`ice-candidate`**: Client sends an ICE candidate to a peer.
  - Data: `{ peerId: string, candidate: RTCIceCandidateInit, from?: string }`
- **`initiator-online`**: (Custom) Initiator signals online/ready status in the room.
  - Data: `{ roomId: string }`
- **`recipient-ready`**: (Custom) Recipient signals ready status in the room.
  - Data: `{ roomId: string, peerId: string }`

**Server-to-Client Events:**

- **`joinResponse`**: Response to a `join` request.
  - Data: `{ success: boolean, message: string, roomId: string }`
- **`ready`**: Notifies clients in a room that a new peer has joined and is ready.
  - Data: `{ peerId: string }` (ID of the new peer)
- **`offer`**: Forwards an SDP offer from one peer to another.
  - Data: `{ offer: RTCSessionDescriptionInit, peerId: string }` (ID of the sender)
- **`answer`**: Forwards an SDP answer from one peer to another.
  - Data: `{ answer: RTCSessionDescriptionInit, peerId: string }` (ID of the sender)
- **`ice-candidate`**: Forwards an ICE candidate from one peer to another.
  - Data: `{ candidate: RTCIceCandidateInit, peerId: string }` (ID of the sender)
- **`initiator-online`**: (Custom) Broadcasts that the initiator is online in the room.
  - Data: `{ roomId: string }`
- **`recipient-ready`**: (Custom) Broadcasts that a recipient is ready.
  - Data: `{ peerId: string }` (ID of the ready recipient)
- **`peer-disconnected`**: Notifies clients in a room that a peer has disconnected.
  - Data: `{ peerId: string }`

## Redis Data Usage Summary

Redis is used for:

- **Room Information (`room:<roomId>` - Hash):** Stores room creation time. TTL is managed.
- **Sockets in Room (`room:<roomId>:sockets` - Set):** Stores `socketId`s of clients in a room. TTL is tied to the room's TTL.
- **Socket to Room Mapping (`socket:<socketId>` - String):** Maps a `socketId` to its `roomId`. TTL is managed.
- **Rate Limiting (`ratelimit:join:<ipAddress>` - Sorted Set):** Tracks IP-based request timestamps for join operations for rate limiting. TTL is managed.
- **Referrer Tracking (`referrers:daily:<YYYY-MM-DD>` - Hash):** Stores daily referrer counts. TTL is 30 days.

## Contributing

(Placeholder for contribution guidelines - e.g., fork, branch, PR, coding standards)

## License

(Placeholder for license - e.g., MIT, Apache 2.0)

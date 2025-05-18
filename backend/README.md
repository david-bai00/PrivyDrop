# Privydrop - Backend

This is the backend server for Privydrop, a WebRTC based file sharing application. It handles signaling for WebRTC connections, room management, API requests from the frontend, and other related backend logic.

## Features

- **WebRTC Signaling:** Facilitates peer-to-peer connections using Socket.IO for exchanging SDP offers, answers, and ICE candidates.
- **Room Management:** Allows users to create and join unique rooms for file sharing sessions. Room state and participant information are managed using Redis.
- **API Endpoints:** Provides HTTP APIs for the frontend to interact with (e.g., creating/joining rooms, checking room availability).
- **Real-time Communication:** Uses Socket.IO for instant messaging between clients and server.
- **Rate Limiting:** Basic IP-based rate limiting for certain operations to prevent abuse.
- **Ephemeral Data Storage:** Leverages Redis for storing temporary data like room information and session details, with automatic expiry.
- **Referrer Tracking:** Basic daily tracking of traffic sources (referrers).

## Tech Stack

- **Node.js:** JavaScript runtime environment.
- **Express.js:** Web application framework for Node.js.
- **TypeScript:** Superset of JavaScript for static typing.
- **Socket.IO:** Library for real-time, bidirectional event-based communication.
- **Redis:** In-memory data structure store, used for caching, session management, and message brokering.
  - **ioredis:** A robust Redis client for Node.js.
- **CORS:** Middleware for enabling Cross-Origin Resource Sharing.
- **dotenv:** Module to load environment variables from a `.env` file.
- **PM2 (Ecosystem file provided):** Production process manager for Node.js applications.
- **Docker:** Containerization platform.

## Project Structure

The backend source code is primarily located in the `src/` directory:
.
├── DEPLOYMENT.md
├── docker # Docker related files (Dockerfile, Nginx/TURN configs if used).
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
│ ├── config # Environment variables and server configurations (CORS).
│ │ ├── env.ts
│ │ └── server.ts
│ ├── routes # API route definitions (Express routers).
│ │ └── api.ts
│ ├── server.ts # Main application entry point: Express server and Socket.IO setup.
│ ├── services # Core business logic (room management, Redis interactions, rate limiting).
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

## Environment Variables

Create a `.env.development.local` file in the `backend/` directory for local development (or `.env.production.local` for production-like environments). Populate it with the following variables:

```ini
# Server Configuration
PORT=3001
NODE_ENV=development # or production
CORS_ORIGIN=http://localhost:3000 # URL of your frontend application

# Redis Configuration
REDIS_HOST=127.0.0.1 # Or your Redis server host
REDIS_PORT=6379      # Or your Redis server port
# REDIS_PASSWORD=your_redis_password # Optional: if your Redis is password protected (code needs adjustment to use this)
```

**Note:** The application will exit on startup if `REDIS_HOST` or `REDIS_PORT` are not defined.

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
4.  **Ensure Redis is running** and accessible with the credentials provided in your `.env` file.
5.  **Create and configure your `.env.development.local` file** as described above.
6.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The server should start on the port specified in your `PORT` environment variable (defaults to 3001).

## Docker Deployment

1.  **Navigate to the `backend/` directory.** (This assumes your `Dockerfile` is in `backend/docker/Dockerfile` but the build context is `backend/`)
2.  **Build the Docker image:**
    ```bash
    docker build -t privydrop-backend -f docker/Dockerfile .
    ```
3.  **Run the Docker container:**
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
    - Adjust `-p` if your internal `PORT` differs or you want to map to a different host port.
    - Replace placeholder values for environment variables (`-e`).
    - For a production setup, you'll likely use Docker Compose and might run Nginx as a reverse proxy and a TURN server. Refer to configurations in the `backend/docker/nginx/` and `backend/docker/turn/` directories (if you structure them as suggested) and potentially a `docker-compose.yml` file.

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
  - Checks if a given `roomId` is available (i.e., does not exist).
  - Request Body: `{ "roomId": "string" }`
  - Response: `{ "available": boolean }`
- **`POST /api/set_track`**
  - Tracks a referrer event. Stores daily statistics in Redis with a 30-day TTL.
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
- **`initiator-online`**: (Custom) Initiator signals it's online/ready in a room.
  - Data: `{ roomId: string }`
- **`recipient-ready`**: (Custom) Recipient signals it's ready in a room.
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
- **`initiator-online`**: (Custom) Broadcasts that an initiator is online in the room.
  - Data: `{ roomId: string }`
- **`recipient-ready`**: (Custom) Broadcasts that a recipient is ready.
  - Data: `{ peerId: string }` (ID of the ready recipient)
- **`peer-disconnected`**: Notifies clients in a room that a peer has disconnected.
  - Data: `{ peerId: string }`

## Redis Data Usage Summary

Redis is used for:

- **Room Information (`room:<roomId>` - Hash):** Stores room creation time. TTL managed.
- **Sockets in Room (`room:<roomId>:sockets` - Set):** Stores `socketId`s of clients in a room. TTL tied to room TTL.
- **Socket to Room Mapping (`socket:<socketId>` - String):** Maps a `socketId` to its `roomId`. TTL managed.
- **Rate Limiting (`ratelimit:join:<ipAddress>` - Sorted Set):** Tracks request timestamps for IP-based rate limiting on join operations. TTL managed.
- **Referrer Tracking (`referrers:daily:<YYYY-MM-DD>` - Hash):** Stores daily counts of referrers. TTL of 30 days.

## Contributing

(Placeholder for contribution guidelines - e.g., fork, branch, PR, coding standards)

## License

(Placeholder for license - e.g., MIT, Apache 2.0)

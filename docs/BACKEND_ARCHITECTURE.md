# PrivyDrop - Backend Architecture Deep Dive

## 1. Overview

### 1.1 Core Responsibilities

The PrivyDrop backend is a lightweight server built on Node.js and Express.js. Its core responsibility is **not to transfer files directly** but to act as a "**Signaling Server**" and "**Room Coordinator**" for establishing WebRTC connections.

Its main functions include:

- **HTTP API Service**: Provides RESTful interfaces for creating, querying, and checking the status of rooms.
- **WebRTC Signaling**: Utilizes Socket.IO to relay signaling messages (SDP Offers/Answers, ICE Candidates) between clients in real-time to facilitate P2P connections.
- **Room Lifecycle Management**: Efficiently manages the state of rooms and participants using Redis, leveraging its TTL mechanism for automatic cleanup.
- **Basic Security**: Implements IP-based rate limiting to prevent service abuse.

### 1.2 Design Principles

- **Stateless**: The backend service itself does not hold any state related to rooms or users. All state is delegated to an external Redis service, which allows the backend application to be easily scaled horizontally.
- **Lightweight Signaling**: The server acts only as a relay for signaling messages. It does not parse or store the content of these signals, ensuring the privacy of end-to-end communication.
- **High Efficiency & Low Latency**: Employs Redis as an in-memory database for room state management and Socket.IO for real-time communication to minimize the latency of signal exchange.
- **Single Responsibility**: Each module (API, Socket handling, Redis service) has a clear and single responsibility, making it easy to understand, maintain, and test.

## 2. Project Structure

The backend source code is organized by functional modules, primarily located in the `src/` directory:

```
backend/
├── src/
│ ├── config/       # Environment variables and server configuration (CORS)
│ │ ├── env.ts
│ │ └── server.ts
│ ├── routes/       # API route definitions (Express router)
│ │ └── api.ts
│ ├── services/     # Core business logic (Room, Redis, Rate Limiting)
│ │ ├── rateLimit.ts
│ │ ├── redis.ts
│ │ └── room.ts
│ ├── socket/       # Socket.IO event handlers and signaling logic
│ │ └── handlers.ts
│ ├── types/        # TypeScript type definitions and interfaces
│ │ ├── room.ts
│ │ └── socket.ts
│ └── server.ts     # Main application entry point: Express and Socket.IO setup
├── ecosystem.config.js # PM2 configuration file
├── package.json
└── tsconfig.json
```

## 3. Core Module Deep Dive

### 3.1 Application Entry Point (`src/server.ts`)

This is the application's startup file. It is responsible for:

1.  Loading environment variables.
2.  Initializing the Express application instance.
3.  Configuring middleware such as CORS and JSON parsing.
4.  Mounting the `/api` routes.
5.  Creating an HTTP server and attaching the Socket.IO service to it.
6.  Calling `initializeSocketHandlers` to set up all Socket.IO event listeners.
7.  Starting the server and listening on the specified port.

### 3.2 API Routes (`src/routes/api.ts`)

Defines all the HTTP RESTful APIs called by the frontend.

- **`POST /api/create_room`**: Receives a `roomId` specified by the frontend, checks for its availability, and creates a new room if available.
- **`GET /api/get_room`**: Generates a unique, random room ID, creates the room, and returns it to the frontend.
- **`POST /api/check_room`**: Checks if a given `roomId` already exists.
- **`POST /api/set_track`**: Used to track traffic sources (referrers).
- **`POST /api/logs_debug`**: A simple debugging endpoint to receive logs from the frontend and print them on the backend console.

### 3.3 Socket.IO Event Handling (`src/socket/handlers.ts`)

This is the core of the signaling exchange. The `initializeSocketHandlers` function binds a series of event handlers to an incoming `socket` connection.

- **Connection & Disconnection**:
  - `connection`: Logs the `socket.id` when a new client connects.
  - `disconnect`: When a client disconnects, it is removed from the room it was in, and other peers in the room are notified (`peer-disconnected`).
- **Room Logic**:
  - **`join`**: Handles a client's request to join a room. It verifies if the room exists, adds the client's `socket.id` to the room's set of members, and finally sends a `joinResponse` to the requester.
  - **`initiator-online`**: Emitted by the room creator (initiator), often when the app comes back from being backgrounded, to notify the recipient, "I'm online, let's re-establish the connection."
  - **`recipient-ready`**: Emitted by the recipient to notify the initiator in the room, "I'm ready, you can start the reconnection process," which typically signals the start of the WebRTC `offer` flow.
- **WebRTC Signaling Forwarding**:
  - **`offer`**, **`answer`**, **`ice-candidate`**: These three events are pure relays. They are responsible for accurately forwarding a peer's WebRTC signaling message to the other peer in the room.

### 3.4 Service Layer (`src/services/`)

Encapsulates interactions with external dependencies (like Redis) and core business logic.

- **`redis.ts`**: Provides a singleton instance of the Redis client. All interactions with Redis should go through this module.
- **`room.ts`**: Encapsulates all room-related Redis operations, such as `createRoom`, `isRoomExist`, `bindSocketToRoom`, etc. It decouples business logic (e.g., "add user to room") from the underlying Redis commands (e.g., `SADD`, `HSET`).
- **`rateLimit.ts`**: Implements a rate limiter based on IP address and a Redis Sorted Set to restrict users from creating or joining rooms too frequently in a short period.

## 4. Redis Data Structure Deep Dive

Redis is a key component of the backend, used to store all temporary state. We cleverly use different data structures to meet business needs and set a TTL for all keys to ensure automatic data cleanup.

- **1. Room Information (`Hash`)**:

  - **Key Pattern**: `room:<roomId>` (e.g., `room:ABCD12`)
  - **Purpose**: Stores the metadata of a room.
  - **Fields**:
    - `created_at`: Timestamp of when the room was created.
  - **Example**: `HSET room:ABCD12 created_at 1705123456789`

- **2. Sockets in a Room (`Set`)**:

  - **Key Pattern**: `room:<roomId>:sockets` (e.g., `room:ABCD12:sockets`)
  - **Purpose**: Stores all client `socketId`s within a single room. Using a Set guarantees the uniqueness of members and makes additions and removals convenient.
  - **Members**: The client's `socketId`.
  - **Example**: `SADD room:ABCD12:sockets "socketId_A" "socketId_B"`

- **3. Socket-to-Room Mapping (`String`)**:

  - **Key Pattern**: `socket:<socketId>` (e.g., `socket:xgACY6QcQCojsOQaAAAB`)
  - **Purpose**: Provides a reverse mapping from a `socketId` to its `roomId`. This is very useful when handling client disconnections, as we can quickly find the room and perform cleanup using only the `socketId`.
  - **Value**: The `roomId`.
  - **Example**: `SET socket:xgACY6QcQCojsOQaAAAB ABCD12`

- **4. Rate Limiting (`Sorted Set`)**:

  - **Key Pattern**: `ratelimit:join:<ipAddress>` (e.g., `ratelimit:join:192.168.1.100`)
  - **Purpose**: Records all request timestamps from a specific IP address within a given time window.
  - **Members**: `timestamp-randomNumber` (e.g., `1678886400000-0.12345`). A random number suffix is used to ensure uniqueness for multiple requests within the same millisecond.
  - **Score**: The Unix timestamp of the request (in milliseconds).
  - **Logic**: Old records outside the time window are removed using `ZREMRANGEBYSCORE`, and then the number of requests within the window is counted with `ZCARD` to determine if the limit has been exceeded.

- **5. Referrer Tracking (`Hash`)**:
  - **Key Pattern**: `referrers:daily:<YYYY-MM-DD>` (e.g., `referrers:daily:2023-03-15`)
  - **Purpose**: Tracks the number of visits from different sources (Referrers) on a daily basis.
  - **Fields**: The referrer's domain name (e.g., `google.com`, `github.com`).
  - **Value**: The cumulative visit count for the day.
  - **Logic**: The `HINCRBY` command is used to atomically increment the count for a specified source. 
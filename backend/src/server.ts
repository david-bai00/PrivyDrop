import express from "express"; // express: A minimalist and flexible Node.js web application framework
import cors from "cors";
import http from "http";
import { Server } from "socket.io"; // socket.io: A library for real-time web applications, enables real-time, bi-directional communication between web clients and servers.
import { CONFIG } from "./config/env";
import { corsOptions, corsWSOptions } from "./config/server";
import apiRouter from "./routes/api";
import { setupSocketHandlers } from "./socket/handlers";

const app = express(); // Create an Express application
app.use(cors(corsOptions)); // Add CORS middleware
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, { cors: corsWSOptions });
setupSocketHandlers(io);

// Make io instance available to routes
app.set('io', io);

app.use(apiRouter);

server.listen(CONFIG.BACKEND_PORT, () => {
  console.log(
    `Signaling server running in ${CONFIG.NODE_ENV} mode on port ${CONFIG.BACKEND_PORT}`
  );
});

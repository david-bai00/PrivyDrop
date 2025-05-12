import express from "express"; //express: 用于创建一个简洁且灵活的Node.js web应用框架
import cors from "cors";
import http from "http";
import { Server } from "socket.io"; //实时通信库，基于WebSocket协议，实现双向通信
import { CONFIG } from "./config/env";
import { corsOptions, corsWSOptions } from "./config/server";
import apiRouter from "./routes/api";
import { setupSocketHandlers } from "./socket/handlers";

const app = express(); //创建一个Express应用
app.use(cors(corsOptions)); // 添加 CORS 中间件
app.use(express.json());
app.use(apiRouter);

const server = http.createServer(app);

const io = new Server(server, { cors: corsWSOptions });
setupSocketHandlers(io);

server.listen(CONFIG.PORT, () => {
  console.log(
    `Signaling server running in ${CONFIG.NODE_ENV} mode on port ${CONFIG.PORT}`
  );
});

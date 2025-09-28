import { CorsOptions } from "cors";
import { CONFIG } from "./env";

// Define the sources allowed in the development environment
const DEV_ORIGINS = [
  CONFIG.CORS_ORIGIN, // http://localhost:3002
  "http://localhost:3002", // alternate port
  /^http:\/\/192\.168\.\d+\.\d+:3002$/, // LAN addresses
  /^http:\/\/192\.168\.\d+\.\d+:3002$/, // LAN addresses with new port
];

// 解析生产环境下的多来源配置（逗号分隔）
const parseProdOrigins = (): string | RegExp | (string | RegExp)[] => {
  const v = CONFIG.CORS_ORIGIN?.trim();
  if (!v) return DEV_ORIGINS; // 回退到开发白名单
  if (v.includes(",")) {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return v;
};

// Configure CORS
export const corsOptions: CorsOptions =
  CONFIG.NODE_ENV === "production"
    ? {
        origin: parseProdOrigins(),
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
      }
    : {
        origin: DEV_ORIGINS,
        credentials: true,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      };
// Configure CORS for Socket.IO
export const corsWSOptions =
  CONFIG.NODE_ENV === "production"
    ? {
        origin: parseProdOrigins(),
        methods: ["GET", "POST"],
        credentials: true,
      }
    : {
        // Allow multiple origins in development environment
        origin: DEV_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true,
      };

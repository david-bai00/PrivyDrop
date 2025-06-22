import { CorsOptions } from "cors";
import { CONFIG } from "./env";
// Configure CORS
export const corsOptions: CorsOptions =
  CONFIG.NODE_ENV === "production"
    ? {
        origin: CONFIG.CORS_ORIGIN,
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
      }
    : {
        origin: true, // Allow all origins in development environment
        credentials: true,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      };
// Configure CORS for Socket.IO
export const corsWSOptions =
  CONFIG.NODE_ENV === "production"
    ? {
        origin: CONFIG.CORS_ORIGIN, // Allowed origin, replace with your Next.js application's URL
        methods: ["GET", "POST"],
        credentials: true,
      }
    : {
        // Allow multiple origins in development environment
        origin: [
          CONFIG.CORS_ORIGIN,
          /^http:\/\/192\.168\.\d+\.\d+:3000$/, // Match all LAN addresses in the format 192.168.x.x:3000
        ],
        methods: ["GET", "POST"],
        credentials: true,
      };

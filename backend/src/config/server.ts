import { CorsOptions } from "cors";
import { CONFIG } from "./env";

// Define the sources allowed in the development environment
const DEV_ORIGINS = [
  CONFIG.CORS_ORIGIN,                         // http://localhost:3002
  'http://localhost:3000',                    // alternate port
  /^http:\/\/192\.168\.\d+\.\d+:3000$/,      // LAN addresses
  /^http:\/\/192\.168\.\d+\.\d+:3002$/       // LAN addresses with new port
];

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
        origin: DEV_ORIGINS,
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
        origin: DEV_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true,
      };

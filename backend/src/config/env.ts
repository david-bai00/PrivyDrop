import dotenv from "dotenv";
import path from "path";

// Define the type for the configuration object
interface AppConfig {
  BACKEND_PORT: number;
  CORS_ORIGIN: string;
  NODE_ENV: "development" | "production";
  REDIS: {
    HOST: string;
    PORT: number;
  };
}

// Load the corresponding .env file based on the environment
dotenv.config({
  path:
    process.env.NODE_ENV === "production"
      ? path.resolve(process.cwd(), ".env.production")
      : path.resolve(process.cwd(), ".env.development"),
});
// Check for necessary Redis environment variables
if (!process.env.REDIS_HOST) {
  console.error("FATAL ERROR: REDIS_HOST environment variable is not set.");
  process.exit(1); // Or throw an error: new Error("REDIS_HOST environment variable is not set.");
}
if (!process.env.REDIS_PORT) {
  console.error("FATAL ERROR: REDIS_PORT environment variable is not set.");
  process.exit(1); // Or throw an error: new Error("REDIS_PORT environment variable is not set.");
}
// Export the type-safe configuration object
export const CONFIG: AppConfig = {
  BACKEND_PORT: parseInt(process.env.BACKEND_PORT || "3001", 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN!,
  NODE_ENV:
    (process.env.NODE_ENV as "development" | "production") || "development",
  REDIS: {
    HOST: process.env.REDIS_HOST,
    PORT: parseInt(process.env.REDIS_PORT, 10),
  },
};

import { CorsOptions } from 'cors';
import { CONFIG } from './env';
// 配置 CORS
export const corsOptions: CorsOptions = CONFIG.NODE_ENV === 'production' 
  ? {
      origin: CONFIG.CORS_ORIGIN,
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization']
    }
  : {
    origin: true, // 开发环境允许所有源
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };
// 配置 Socket.IO 的 CORS
export const corsWSOptions = CONFIG.NODE_ENV === 'production'
  ? {
      origin: CONFIG.CORS_ORIGIN,// 允许的源，替换为你的Next.js应用的URL
      methods: ['GET', 'POST'],
      credentials: true
    }
  : {
      // 开发环境下允许多个源
      origin: [
        CONFIG.CORS_ORIGIN,
        /^http:\/\/192\.168\.\d+\.\d+:3000$/,// 匹配所有 192.168.x.x:3000 格式的局域网地址
      ],
      methods: ['GET', 'POST'],
      credentials: true
    };
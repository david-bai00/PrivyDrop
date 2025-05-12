import dotenv from 'dotenv';
import path from 'path';

// 定义配置对象的类型
interface AppConfig {
  PORT: number;
  CORS_ORIGIN: string;
  NODE_ENV: 'development' | 'production';
  REDIS: {
    HOST: string;
    PORT: number;
  };
}

// 根据环境加载对应的.env文件
dotenv.config({
  path: process.env.NODE_ENV === 'production'
    ? path.resolve(process.cwd(), '.env.production.local')
    : path.resolve(process.cwd(), '.env.development.local')
});

// 导出类型安全的配置对象
export const CONFIG: AppConfig = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN!,
  NODE_ENV: (process.env.NODE_ENV as 'development' | 'production') || 'development',
  REDIS: {
    HOST: 'localhost',
    PORT: 6379
  }
};
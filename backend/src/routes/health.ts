import { Router, Request, Response } from 'express';
import { redis } from '../services/redis';
import { CONFIG } from '../config/env';

const router = Router();

// 应用启动时间
const startTime = Date.now();

// 基础健康检查
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      service: 'privydrop-backend',
      version: process.env.npm_package_version || '1.0.0',
      environment: CONFIG.NODE_ENV
    };

    res.status(200).json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'privydrop-backend',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API路径的健康检查 (兼容性)
router.get('/api/health', async (req: Request, res: Response) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      service: 'privydrop-backend',
      version: process.env.npm_package_version || '1.0.0',
      environment: CONFIG.NODE_ENV
    };

    res.status(200).json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'privydrop-backend',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 详细健康检查
router.get('/health/detailed', async (req: Request, res: Response) => {
  const errors: string[] = [];
  let status = 'healthy';

  try {
    // 基础信息
    const basicHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      service: 'privydrop-backend',
      version: process.env.npm_package_version || '1.0.0',
      environment: CONFIG.NODE_ENV
    };

    // 检查Redis连接
    const redisHealth = await checkRedisHealth();
    if (redisHealth.status !== 'connected') {
      errors.push('Redis connection failed');
      status = 'unhealthy';
    }

    // 检查Socket.IO状态
    const io = req.app.get('io');
    const socketHealth = {
      status: io ? 'running' : 'not_initialized',
      connections: io ? io.engine.clientsCount : 0
    };

    // 获取系统资源信息
    const systemInfo = getSystemInfo();
    
    // 检查系统资源
    if (systemInfo.memory.percent > 90) {
      errors.push('High memory usage (>90%)');
      status = status === 'healthy' ? 'degraded' : status;
    }

    if (systemInfo.cpu.percent > 80) {
      errors.push('High CPU usage (>80%)');
      status = status === 'healthy' ? 'degraded' : status;
    }

    const detailedHealth = {
      ...basicHealth,
      status,
      dependencies: {
        redis: redisHealth,
        socketio: socketHealth
      },
      system: systemInfo,
      ...(errors.length > 0 && { errors })
    };

    const httpStatus = status === 'healthy' ? 200 : 503;
    res.status(httpStatus).json(detailedHealth);

  } catch (error) {
    console.error('Detailed health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'privydrop-backend',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Redis健康检查函数
async function checkRedisHealth() {
  try {
    const start = Date.now();
    await redis.ping();
    const responseTime = Date.now() - start;
    
    return {
      status: 'connected',
      responseTime,
      host: CONFIG.REDIS.HOST,
      port: CONFIG.REDIS.PORT
    };
  } catch (error) {
    return {
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      host: CONFIG.REDIS.HOST,
      port: CONFIG.REDIS.PORT
    };
  }
}

// 系统信息获取函数
function getSystemInfo() {
  const memUsage = process.memoryUsage();
  const totalMem = memUsage.heapTotal;
  const usedMem = memUsage.heapUsed;
  const freeMem = totalMem - usedMem;

  return {
    memory: {
      used: formatBytes(usedMem),
      free: formatBytes(freeMem),
      total: formatBytes(totalMem),
      percent: Math.round((usedMem / totalMem) * 100)
    },
    cpu: {
      percent: getCpuUsage()
    },
    uptime: process.uptime(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version
  };
}

// 格式化字节数
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 简化的CPU使用率 (基于进程CPU时间)
function getCpuUsage(): number {
  const cpuUsage = process.cpuUsage();
  const totalCpuTime = (cpuUsage.user + cpuUsage.system) / 1000000; // 转换为秒
  const uptime = process.uptime();
  return Math.round((totalCpuTime / uptime) * 100);
}

export default router;
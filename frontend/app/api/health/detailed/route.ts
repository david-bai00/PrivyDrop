import { NextRequest, NextResponse } from 'next/server';

const startTime = Date.now();

export async function GET(request: NextRequest) {
  try {
    const errors: string[] = [];
    let status = 'healthy';

    // 基础健康信息
    const basicHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      service: 'privydrop-frontend',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    // 检查后端API连接
    const backendHealth = await checkBackendHealth();
    if (backendHealth.status !== 'connected') {
      errors.push('Backend API connection failed');
      status = 'degraded';
    }

    // 系统信息
    const systemInfo = {
      runtime: process.env.NEXT_RUNTIME || 'nodejs',
      nextjs: {
        version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      memory: process.memoryUsage ? {
        used: formatBytes(process.memoryUsage().heapUsed),
        total: formatBytes(process.memoryUsage().heapTotal),
        percent: Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100)
      } : null
    };

    const detailedHealth = {
      ...basicHealth,
      status,
      dependencies: {
        backend: backendHealth
      },
      system: systemInfo,
      ...(errors.length > 0 && { errors })
    };

    const httpStatus = status === 'healthy' ? 200 : 503;
    return NextResponse.json(detailedHealth, { status: httpStatus });

  } catch (error) {
    console.error('Detailed frontend health check error:', error);
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'privydrop-frontend',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 });
  }
}

// 检查后端API健康状态
async function checkBackendHealth() {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const start = Date.now();
    
    const response = await fetch(`${backendUrl}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // 设置超时时间
      signal: AbortSignal.timeout(5000)
    });

    const responseTime = Date.now() - start;

    if (response.ok) {
      const data = await response.json();
      return {
        status: 'connected',
        responseTime,
        backendUrl,
        backendService: data.service || 'unknown'
      };
    } else {
      return {
        status: 'error',
        responseTime,
        backendUrl,
        httpStatus: response.status,
        error: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    return {
      status: 'disconnected',
      backendUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// 格式化字节数
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
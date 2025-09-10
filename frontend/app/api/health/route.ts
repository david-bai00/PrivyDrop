import { NextRequest, NextResponse } from 'next/server';

const startTime = Date.now();

export async function GET(request: NextRequest) {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      service: 'privydrop-frontend',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      nextjs: {
        version: process.env.NEXT_RUNTIME || 'nodejs'
      }
    };

    return NextResponse.json(health, { status: 200 });
  } catch (error) {
    console.error('Frontend health check error:', error);
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'privydrop-frontend',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 });
  }
}
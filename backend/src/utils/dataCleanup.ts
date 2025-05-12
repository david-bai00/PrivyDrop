//定时任务处理器
import { Redis } from 'ioredis';

export const cleanupData = async (redis: Redis): Promise<void> => {
  try {
    // 1. 找出30天以前（过期）的每日统计数据
    const today = new Date();
    const thirtyDaysAgo = new Date(today.setDate(today.getDate() - 30));
    
      // 获取所有 daily 统计 key
    const dailyKeys = await redis.keys('referrers:daily:*');
    
    for (const key of dailyKeys) {
      const keyDate = key.split(':')[2];
      if (new Date(keyDate) < thirtyDaysAgo) {
        await redis.del(key);
      } else {
          // 为未过期的 key 重新设置过期时间
        await redis.expire(key, 60 * 60 * 24 * 30); // 30天
      }
    }
    console.log('Data cleanup completed successfully');
  } catch (error) {
    console.error('Error during data cleanup:', error);
  }
};
// scripts/export-tracking-data.js
const Redis = require('ioredis');
const fs = require('fs/promises');
const path = require('path');

// Redis 客户端配置
const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

async function exportTrackingData() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `tracking-data-${timestamp}.txt`;
    const filePath = path.join(__dirname, '../logs', fileName);

    // 创建输出内容
    let output = '=== Tracking Data Export ===\n';
    output += `Generated at: ${new Date().toISOString()}\n\n`;

    // 1. 获取所有来源
    const sources = await redis.smembers('referrers:sources');
    output += '=== Referral Sources ===\n';
    output += sources.join(', ') + '\n\n';

    // 2. 获取总计数
    const totalCounts = await redis.hgetall('referrers:count');
    output += '=== Total Counts by Source ===\n';
    for (const [source, count] of Object.entries(totalCounts)) {
      output += `${source}: ${count}\n`;
    }
    output += '\n';

    // 3. 获取每日统计数据并按日期排序
    output += '=== Daily Statistics ===\n';
    const dailyKeys = await redis.keys('referrers:daily:*');

    // 将 key 转换为包含日期对象的数组,并按日期排序
    const dailyData = await Promise.all(dailyKeys.map(async (key) => {
      const date = key.split(':')[2];
      const dailyStats = await redis.hgetall(key);
        return { date: new Date(date), data: dailyStats };
    }));

    dailyData.sort((a, b) => b.date.getTime() - a.date.getTime()); // 按日期降序排序(最近到最远)

    for (const item of dailyData) {
        const dateString = item.date.toISOString().split('T')[0]; //日期格式化字符串
        output += `\nDate: ${dateString}\n`;
        for (const [source, count] of Object.entries(item.data)) {
        output += `  ${source}: ${count}\n`;
      }
    }

    output += '\n';

    // 5. 添加基本统计信息
    output += '\n=== Summary ===\n';
    output += `Total Sources: ${sources.length}\n`;
    
    // 确保日志目录存在
    await fs.mkdir(path.join(__dirname, '../logs'), { recursive: true });
    
    // 写入文件
    await fs.writeFile(filePath, output, 'utf8');
    
    console.log(`Data exported successfully to: ${filePath}`);
    console.log('\nFile Preview:');
    console.log('='.repeat(50));
    console.log(output.slice(0, 500) + '...');
    console.log('='.repeat(50));

    // 关闭 Redis 连接
    await redis.quit();

  } catch (error) {
    console.error('Error exporting data:', error);
    process.exit(1);
  }
}

// 执行导出
exportTrackingData();

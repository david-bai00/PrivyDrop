// scripts/export-tracking-data.js
const Redis = require('ioredis');
const fs = require('fs/promises');
const path = require('path');

// Redis client configuration
const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

async function exportTrackingData() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `tracking-data-${timestamp}.txt`;
    const filePath = path.join(__dirname, '../logs', fileName);

    // Create output content
    let output = '=== Tracking Data Export ===\n';
    output += `Generated at: ${new Date().toISOString()}\n\n`;

    // 1. Get all sources
    const sources = await redis.smembers('referrers:sources');
    output += '=== Referral Sources ===\n';
    output += sources.join(', ') + '\n\n';

    // 2. Get total counts
    const totalCounts = await redis.hgetall('referrers:count');
    output += '=== Total Counts by Source ===\n';
    for (const [source, count] of Object.entries(totalCounts)) {
      output += `${source}: ${count}\n`;
    }
    output += '\n';

    // 3. Get daily statistics and sort by date
    output += '=== Daily Statistics ===\n';
    const dailyKeys = await redis.keys('referrers:daily:*');

    // Convert keys to an array of objects with dates and sort by date
    const dailyData = await Promise.all(dailyKeys.map(async (key) => {
      const date = key.split(':')[2];
      const dailyStats = await redis.hgetall(key);
        return { date: new Date(date), data: dailyStats };
    }));

    dailyData.sort((a, b) => b.date.getTime() - a.date.getTime()); // Sort by date in descending order (most recent to oldest)

    for (const item of dailyData) {
        const dateString = item.date.toISOString().split('T')[0]; // Format date string
        output += `\nDate: ${dateString}\n`;
        for (const [source, count] of Object.entries(item.data)) {
        output += `  ${source}: ${count}\n`;
      }
    }

    output += '\n';

    // 5. Add basic statistics
    output += '\n=== Summary ===\n';
    output += `Total Sources: ${sources.length}\n`;
    
    // Ensure the log directory exists
    await fs.mkdir(path.join(__dirname, '../logs'), { recursive: true });
    
    // Write to file
    await fs.writeFile(filePath, output, 'utf8');
    
    console.log(`Data exported successfully to: ${filePath}`);
    console.log('\nFile Preview:');
    console.log('='.repeat(50));
    console.log(output.slice(0, 500) + '...');
    console.log('='.repeat(50));

    // Close Redis connection
    await redis.quit();

  } catch (error) {
    console.error('Error exporting data:', error);
    process.exit(1);
  }
}

// Execute export
exportTrackingData();

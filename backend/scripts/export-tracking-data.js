#!/usr/bin/env node
/**
 * Export funnel analytics written by setTrackHandler.
 *
 * Redis keys written by src/routes/api.ts:
 *   referrers:daily:<date>     hash <ref>            -> count
 *   funnel:daily:<date>        hash <event>          -> count
 *   funnel:ref:daily:<date>    hash <event>|<ref>    -> count
 *   funnel:locale:daily:<date> hash <event>|<locale> -> count
 *   funnel:path:daily:<date>   hash <event>|<path>   -> count
 *   funnel:sessions:<date>     set  <sid>            -> unique visitors
 *
 * Usage: node scripts/export-tracking-data.js [redisHost] [redisPort]
 */
const Redis = require("ioredis");
const fs = require("fs/promises");
const path = require("path");

const HOST = process.argv[2] || process.env.REDIS_HOST || "localhost";
const PORT = Number(process.argv[3] || process.env.REDIS_PORT || 6379);

const redis = new Redis({ host: HOST, port: PORT, lazyConnect: true });

function topN(obj, n) {
  const limit = n || 15;
  return Object.entries(obj || {})
    .sort(function (a, b) { return Number(b[1]) - Number(a[1]); })
    .slice(0, limit)
    .map(function (entry) { return "  " + String(entry[1]).padStart(6) + "  " + entry[0]; })
    .join("\n");
}

async function collect(prefix) {
  const keys = await redis.keys(prefix + ":*");
  keys.sort();
  const totals = {};
  const byDate = [];
  for (const key of keys) {
    const date = key.split(":").pop();
    const data = await redis.hgetall(key);
    for (const field of Object.keys(data)) {
      totals[field] = (totals[field] || 0) + Number(data[field]);
    }
    byDate.push({ date: date, data: data });
  }
  return { totals: totals, byDate: byDate };
}

async function main() {
  await redis.connect();

  const refs = await collect("referrers:daily");
  const funnel = await collect("funnel:daily");
  const byRef = await collect("funnel:ref:daily");
  const byLocale = await collect("funnel:locale:daily");
  const byPath = await collect("funnel:path:daily");

  const sessionKeys = (await redis.keys("funnel:sessions:*")).sort();
  const uniques = {};
  let totalUniques = 0;
  for (const key of sessionKeys) {
    const count = await redis.scard(key);
    uniques[key.split(":").pop()] = count;
    totalUniques += count;
  }

  const dates = refs.byDate.map(function (d) { return d.date; }).sort();
  let out = "=== PrivyDrop funnel export ===\n";
  out += "Generated: " + new Date().toISOString() + "\n";
  out += "Range: " + (dates.length ? dates[0] + " .. " + dates[dates.length - 1] : "-") + "\n\n";

  out += "=== Unique visitors per day (session ids) ===\n";
  out += totalUniques + " total session-ids\n";
  Object.keys(uniques)
    .sort()
    .reverse()
    .slice(0, 14)
    .forEach(function (date) { out += "  " + date + ": " + uniques[date] + "\n"; });

  out += "\n=== Acquisition channel (first-touch ref) ===\n" + topN(refs.totals, 15) + "\n";
  out += "\n=== Funnel steps ===\n" + topN(funnel.totals, 30) + "\n";
  out += "\n=== Funnel step by channel ===\n" + topN(byRef.totals, 30) + "\n";
  out += "\n=== Funnel step by locale ===\n" + topN(byLocale.totals, 30) + "\n";
  out += "\n=== Funnel step by landing path ===\n" + topN(byPath.totals, 30) + "\n";

  out += "\n=== Daily funnel steps (last 14 days) ===\n";
  funnel.byDate
    .slice()
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; })
    .slice(0, 14)
    .forEach(function (d) { out += "  " + d.date + ": " + JSON.stringify(d.data) + "\n"; });

  const dir = path.join(__dirname, "../logs");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "funnel-" + new Date().toISOString().replace(/[:.]/g, "-") + ".txt");
  await fs.writeFile(file, out, "utf8");

  process.stdout.write(out);
  console.error("\nWritten to " + file);
  await redis.quit();
}

main().catch(async function (err) {
  console.error("Error exporting data:", err);
  try { await redis.quit(); } catch (e) {}
  process.exit(1);
});

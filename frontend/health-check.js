#!/usr/bin/env node

const http = require('http');

const options = {
  host: 'localhost',
  port: process.env.PORT || 3002,
  path: '/api/health',
  timeout: 2000,
  method: 'GET'
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    console.log('Frontend health check passed');
    process.exit(0);
  } else {
    console.log(`Frontend health check failed with status: ${res.statusCode}`);
    process.exit(1);
  }
});

req.on('error', (err) => {
  console.log(`Frontend health check failed: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.log('Frontend health check timeout');
  req.destroy();
  process.exit(1);
});

req.end();
const Redis = require('ioredis');
const redis = new Redis('redis://redis:6379'); // host: redis, port: 6379

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err));

module.exports = redis;
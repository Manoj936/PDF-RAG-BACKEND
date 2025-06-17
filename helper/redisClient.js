import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

const redis = new Redis(`redis://default:${process.env.REDIS_PASS}@selected-horse-49863.upstash.io:6379`, {
  maxRetriesPerRequest: null,   // prevents crash on retry failure
  enableOfflineQueue: false,    // avoids queuing when disconnected
  lazyConnect: true             // connect only when needed
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err));

export default redis;
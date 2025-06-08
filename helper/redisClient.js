import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();
const redis = new Redis(`rediss://default:${process.env.REDIS_PASS}@real-stinkbug-39224.upstash.io:6379`);

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err));

export default redis;

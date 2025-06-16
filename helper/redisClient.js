import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

let redis;

const commonOptions = {
  maxRetriesPerRequest: null, // 👈 required by BullMQ for blocking commands
};

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, commonOptions);
} else {
  redis = new Redis({
    host: "redis",
    port: 6379,
    ...commonOptions,
  });
}

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (err) => console.error("❌ Redis error:", err));

export default redis;

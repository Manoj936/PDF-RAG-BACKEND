import redis from "./redisClient.js";

export function Ratelimiter(url , MAX_REQUESTS , MAX_WINDOWS_TIME) {
  return async (req, res, next) => {
    try {
      console.log("✅ RateLimiter reached");

      if (!url || !MAX_REQUESTS || !MAX_WINDOWS_TIME) {
        return next();
      }

      const ip = req.headers["x-forwarded-for"] || req.ip;
      const key = `url_rate_limit_${ip}`;
      console.log("IP Key:", key);

      const requests = await redis
        .multi()
        .incr(key)
        .expire(key, MAX_WINDOWS_TIME)
        .exec();

      const reqCount = requests?.[0]?.[1];
      console.log("Request count:", reqCount);

      if (reqCount > MAX_REQUESTS) {
        let msg = '';
        if(url === 'upload/pdf'){
          msg = 'You can upload only 1 file per 5 minute.';
        }
        else{
          msg = 'You can only send 10 messages per minute.';
        }
        return res
          .status(429)
          .json({ message: msg });
      }
      return next();
    } catch (err) {
      console.error("❌ Rate limiter error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}

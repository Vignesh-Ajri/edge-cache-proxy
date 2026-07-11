const { createClient } = require("redis");

const MAX_CACHE_KEYS = 20;

class CacheManager {
  constructor() {
    this.client = null;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      warmups: 0,
    };
    this.warmStatus = {};
  }

  async connect() {
    this.client = createClient({ url: "redis://localhost:6379" });
    this.client.on("error", (err) =>
      console.error("[Redis] Error:", err.message)
    );
    await this.client.connect();
    console.log("[Cache] Connected to Redis");
  }

  async get(key) {
    const value = await this.client.get(`cache:${key}`);
    if (value) {
      this.stats.hits++;
      // Update LRU score (last-access timestamp)
      await this.client.zAdd("cache:lru", [
        { score: Date.now(), value: key },
      ]);
      return JSON.parse(value);
    }
    this.stats.misses++;
    return null;
  }

  async set(key, data, ttl) {
    await this._enforceLRU();
    await this.client.setEx(`cache:${key}`, ttl, JSON.stringify(data));
    await this.client.zAdd("cache:lru", [
      { score: Date.now(), value: key },
    ]);
    console.log(`[Cache] Stored "${key}" TTL=${ttl}s`);
  }

  async delete(key) {
    await this.client.del(`cache:${key}`);
    await this.client.zRem("cache:lru", key);
  }

  async _enforceLRU() {
    const count = await this.client.zCard("cache:lru");
    if (count >= MAX_CACHE_KEYS) {
      const lruKeys = await this.client.zRange("cache:lru", 0, 0);
      if (lruKeys.length > 0) {
        const evictKey = lruKeys[0];
        await this.delete(evictKey);
        this.stats.evictions++;
        console.log(`[Cache] LRU Evicted: "${evictKey}"`);
      }
    }
  }

  // Called by proxy after a successful warm so isWarmedKey() returns true
  markWarmed(key) {
    this.warmStatus[key] = "warm";
    this.stats.warmups++;
  }

  async getStats() {
    const keys = await this.client.zRange("cache:lru", 0, -1);
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests === 0
      ? 0
      : ((this.stats.hits / totalRequests) * 100).toFixed(1);

    const keyDetails = await Promise.all(
      keys.map(async (k) => {
        const ttl = await this.client.ttl(`cache:${k}`);
        return {
          key: k,
          ttl,
          warmStatus: this.warmStatus[k] || "normal",
        };
      })
    );

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      warmups: this.stats.warmups,
      hitRate: parseFloat(hitRate),
      cachedKeys: keyDetails,
      totalRequests,
      warmStatus: this.warmStatus,
    };
  }

  async flush() {
    const keys = await this.client.keys("cache:*");
    if (keys.length) await this.client.del(keys);
    await this.client.del("cache:lru");
    this.stats = { hits: 0, misses: 0, evictions: 0, warmups: 0 };
    this.warmStatus = {};
    console.log("[Cache] Flushed all cache");
  }

  isWarmedKey(key) {
    return this.warmStatus[key] === "warm";
  }
}

module.exports = new CacheManager();
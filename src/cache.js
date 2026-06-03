const { createClient } = require("redis");

const DEFAULT_TTL    = 100;
const MAX_CACHE_KEYS = 20;

class CacheManager {
  constructor() {
    this.client   = null;
    this.stats    = {
      hits:       0,
      misses:     0,
      evictions:  0,
      warmups:    0,
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

  async set(key, data, ttl = DEFAULT_TTL) {
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

  // Pre-fetches a list of paths from origin and stores them in Redis
  // so the very first real user always gets a HIT, not a MISS.
  async warmUp(paths, fetchFn) {
    console.log("[Cache] Starting warm-up for", paths.length, "keys...");
    this.warmStatus = {};

    const results = await Promise.allSettled(
      paths.map(async (path) => {
        this.warmStatus[path] = "warming";
        try {
          const data = await fetchFn(path);
          await this.set(path, data, DEFAULT_TTL);
          this.stats.warmups++;
          this.warmStatus[path] = "warm";
          console.log(`[Cache] Warmed: "${path}"`);
          return { path, ok: true };
        } catch (err) {
          this.warmStatus[path] = "failed";
          console.error(`[Cache] Warm-up failed for "${path}":`, err.message);
          return { path, ok: false, error: err.message };
        }
      })
    );

    const warmed = results.filter((r) => r.value?.ok).length;
    console.log(`[Cache] Warm-up complete - ${warmed}/${paths.length} keys ready`);
    return results.map((r) => r.value);
  }

  async getStats() {
    const keys          = await this.client.zRange("cache:lru", 0, -1);
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate       = totalRequests === 0
      ? 0
      : ((this.stats.hits / totalRequests) * 100).toFixed(1);

    const keyDetails = await Promise.all(
      keys.map(async (k) => {
        const ttl = await this.client.ttl(`cache:${k}`);
        return {
          key:        k,
          ttl,
          warmStatus: this.warmStatus[k] || "normal",  
        };
      })
    );

    return {
      hits:         this.stats.hits,
      misses:       this.stats.misses,
      evictions:    this.stats.evictions,
      warmups:      this.stats.warmups,                
      hitRate:      parseFloat(hitRate),
      cachedKeys:   keyDetails,
      totalRequests,
      warmStatus:   this.warmStatus,                   
    };
  }

  async flush() {
    const keys = await this.client.keys("cache:*");
    if (keys.length) await this.client.del(keys);
    await this.client.del("cache:lru");
    this.stats      = { hits: 0, misses: 0, evictions: 0, warmups: 0 };
    this.warmStatus = {};
    console.log("[Cache] Flushed all cache");
  }

  isWarmedKey(key) {
    return this.warmStatus[key] === "warm";
  }
}

module.exports = new CacheManager();
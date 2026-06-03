# edge-cache-proxy

A Redis-backed edge caching proxy server with a live dashboard. Sits between clients and an origin server, caching API responses to reduce latency and origin load.

---

## What It Does

- Caches API responses in Redis with LRU eviction
- Pre-warms the cache on startup so the first request is always a HIT
- Live dashboard with real-time hit/miss stats via Socket.IO
- Simulates origin server latency (~800ms) to show the cache speedup clearly

---

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or above)
- [Redis](https://redis.io/) (see setup below)

---

## Step 1 — Install Redis

### Windows

1. Download the installer from the link below:
   👉 [Redis-x64-5.0.14.1.msi](https://github.com/microsoftarchive/redis/releases/tag/win-5.0.14.1)

2. Run the `.msi` installer and follow the setup wizard.

3. After install, open the Redis folder (usually `C:\Program Files\Redis\`) and double-click:

   ```
   redis-server.exe
   ```

4. Keep that window open. To verify Redis is running, open a new terminal and run:
   ```bash
   redis-cli.exe ping
   ```
   You should see:
   ```
   PONG
   ```

> **Tip:** To run Redis automatically as a Windows service (so you don't need to start it manually every time):
>
> ```bash
> redis-server.exe --service-install
> redis-server.exe --service-start
> ```

---

### macOS

```bash
brew install redis
brew services start redis
redis-cli ping   # should return PONG
```

---

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
redis-cli ping   # should return PONG
```

---

## Step 2 — Clone & Install Dependencies

```bash
git clone https://github.com/your-username/edge-cache-proxy.git
cd edge-cache-proxy
npm install
```

---

## Step 3 — Run the Project

You need **two terminals** running at the same time:

**Terminal 1 — Origin Server:**

```bash
node origin.js
```

Runs on `http://localhost:4000`

**Terminal 2 — Edge Proxy:**

```bash
node proxy.js
```

Runs on `http://localhost:3000`

---

## Step 4 — Open the Dashboard

Visit in your browser:

```
http://localhost:3000
```

From the dashboard you can:

- Hit individual API endpoints (`/api/products`, `/api/news`, etc.)
- Run a **load test** (20 requests)
- **Flush** the cache and watch misses turn into hits
- See live latency bars, hit rate, and cached keys with TTL countdowns

---

## Project Structure

```
edge-cache-proxy/
├── src/
│   ├── cache.js       # Redis cache manager (LRU eviction, warm-up, stats)
|   ├── origin.js      # Simulated origin server with 800ms latency (port 4000)
|   └── proxy.js       # Edge proxy with cache warming + Socket.IO (port 3000)
├── public/
│   └── index.html # Live dashboard UI
├── package.json
└── .gitignore
```

---

## API Endpoints

| Endpoint              | Description                    |
| --------------------- | ------------------------------ |
| `GET /api/products`   | List of products               |
| `GET /api/news`       | Latest news items              |
| `GET /api/weather`    | Current weather (Bengaluru)    |
| `GET /api/users`      | User list                      |
| `GET /admin/stats`    | Cache stats (JSON)             |
| `DELETE /admin/cache` | Flush the cache                |
| `POST /admin/warm`    | Manually trigger cache warm-up |

---

## How Caching Works

```
Client → Proxy (port 3000)
            ↓ cache HIT?  → return from Redis (~5ms)
            ↓ cache MISS? → fetch from Origin (port 4000) (~800ms) → store in Redis
```

- Default TTL: **30 seconds**
- Max cached keys: **20** (LRU eviction kicks in after that)
- Cache is **pre-warmed** on proxy startup for all 4 routes

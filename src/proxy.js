//  EDGE PROXY SERVER  -  port 3000
// Cache Warming on startup
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const cron = require("node-cron");
const path = require("path");
const cache = require("./cache");

const app = express();
const server = http.createServer(app);
const io     = new Server(server);

const ORIGIN = "http://localhost:4000";
const PORT = 3000;

const WARM_ROUTES = [
  "/api/products",
  "/api/news",
  "/api/weather",
  "/api/users",
];

app.use(express.static(path.join(__dirname, "../public")));

app.delete("/admin/cache", async (req, res) => {
  await cache.flush();
  io.emit("cache_flushed");
  res.json({ message: "Cache cleared" });
});

app.get("/admin/stats", async (req, res) => {
  res.json(await cache.getStats());
});

app.post("/admin/warm", async (req, res) => {
  const result = await warmCache();
  io.emit("cache_warmed", result);
  res.json({ message: "Cache warmed", routes: result });
});

app.get(/^\/api\/.*/, async (req, res) => {
  const key       = req.path;
  const startTime = Date.now();
  const cached    = await cache.get(key);

  if (cached) {
    const latency  = Date.now() - startTime;
    const isWarmed = cache.isWarmedKey(key);
    console.log(`[Proxy] HIT ${isWarmed ? "(warmed) " : ""}${key}  (${latency}ms)`);
    io.emit("request_event", { type: "HIT", path: key, latency, warmed: isWarmed, time: new Date().toLocaleTimeString() });
    return res.json({ ...cached, cacheStatus: "HIT", latency, warmed: isWarmed });
  }

  try {
    const response = await axios.get(`${ORIGIN}${key}`);
    const data     = response.data;
    const latency  = Date.now() - startTime;
    await cache.set(key, data, 30);
    console.log(`[Proxy] MISS ${key}  (${latency}ms)`);
    io.emit("request_event", { type: "MISS", path: key, latency, warmed: false, time: new Date().toLocaleTimeString() });
    return res.json({ ...data, cacheStatus: "MISS", latency });
  } catch (err) {
    const latency = Date.now() - startTime;
    console.error(`[Proxy] ERROR ${key}:`, err.message);
    io.emit("request_event", { type: "ERROR", path: key, latency, warmed: false, time: new Date().toLocaleTimeString() });
    return res.status(502).json({ error: "Origin server unreachable", path: key });
  }
});

async function warmCache() {
  console.log("\n[Warm] Starting cache warming...");
  const results = [];
  for (const route of WARM_ROUTES) {
    try {
      const start    = Date.now();
      const response = await axios.get(`${ORIGIN}${route}`);
      const latency  = Date.now() - start;
      await cache.set(route, response.data, 30);
      results.push({ route, status: "warmed", latency });
      console.log(`[Warm] ✓ ${route}  (${latency}ms)`);
    } catch (err) {
      results.push({ route, status: "failed", error: err.message });
      console.warn(`[Warm] ✗ ${route}  — origin unreachable`);
    }
  }
  const ok = results.filter(r => r.status === "warmed").length;
  console.log(`[Warm] Done. ${ok}/${WARM_ROUTES.length} routes warmed.\n`);
  return results;
}

cron.schedule("*/3 * * * * *", async () => {
  const stats = await cache.getStats();
  io.emit("stats_update", stats);
});

io.on("connection", async (socket) => {
  console.log("[Dashboard] Client connected");
  socket.emit("stats_update", await cache.getStats());
});

async function start() {
  await cache.connect();
  await warmCache();
  server.listen(PORT, () => {
    console.log(`[Edge Proxy] Running on http://localhost:${PORT}`);
    console.log(`[Dashboard]  http://localhost:${PORT}\n`);
  });
}

start();
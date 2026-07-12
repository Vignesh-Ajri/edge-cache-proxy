//  ORIGIN SERVER
//  Runs on port 4000

const express = require("express");
const app = express();

const DELAY_MS = 800; // simulate network/DB latency

const DATA = {
  "/api/products": [
    { id: 1, name: "Laptop", price: 999,  stock: 50  },
    { id: 2, name: "Phone", price: 599,  stock: 120 },
    { id: 3, name: "Headphones", price: 199,  stock: 80  },
    { id: 4, name: "Tablet", price: 449,  stock: 35  },
  ],
  "/api/news": [
    { id: 1, title: "Edge computing is the future", date: "2024-01-01" },
    { id: 2, title: "Redis hits 1 billion downloads", date: "2024-01-02" },
    { id: 3, title: "CDN market grows 30% in 2024", date: "2024-01-03" },
    { id: 4, title: "WebSockets replace polling", date: "2024-01-04" },
  ],
  "/api/weather": {
    city: "Bengaluru", temp: "28°C", condition: "Partly Cloudy",
    humidity: "65%", wind: "12 km/h",
  },
  "/api/users": [
    { id: 1, name: "Alice", role: "Admin" },
    { id: 2, name: "Bob", role: "User" },
    { id: 3, name: "Carol", role: "User" },
    { id: 4, name: "Dave",  role: "Editor" },
  ],
};

// Artificial delay on every request - simulates slow origin/DB
app.use((req, res, next) => {
  setTimeout(next, DELAY_MS);
});

app.get(/^\/api\/.*/, (req, res) => {
  const data = DATA[req.path];
  if (!data) return res.status(404).json({ error: "Not found" });
  console.log(`[Origin] Served ${req.path} (after ${DELAY_MS}ms delay)`);
  res.json({
    source: "origin-server",
    path: req.path,
    data,
    servedAt: new Date().toISOString(),
  });
});

app.listen(4000, () =>
  console.log("[Origin Server] Running on http://localhost:4000")
);
// ============================================================
//  FinChat — Proxy Server
//  Jalankan lokal: node server.js
//  Deploy: set environment variable ANTHROPIC_API_KEY
// ============================================================

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

// Port dari environment (Render inject ini otomatis) atau 3001 lokal
const PORT = process.env.PORT || 3001;

// API key dari environment variable — JANGAN hardcode di sini
const API_KEY = process.env.ANTHROPIC_API_KEY || "";

if (!API_KEY) {
  console.warn("[FinChat] ⚠️  ANTHROPIC_API_KEY tidak ditemukan!");
  console.warn("[FinChat]    Set environment variable sebelum jalan.");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Proxy ke Anthropic API ────────────────────────────────
  if (pathname === "/api/messages" && req.method === "POST") {
    if (!API_KEY) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: { message: "API key belum dikonfigurasi di server." },
        }),
      );
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
        },
      };

      const proxyReq = https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        proxyRes.pipe(res);
      });

      proxyReq.on("error", (err) => {
        console.error("[Proxy] Error:", err.message);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: { message: "Proxy error: " + err.message } }),
        );
      });

      proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }

  // ── Static file server ────────────────────────────────────
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = path.join(__dirname, filePath);

  // Security: cegah path traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const mime = MIME[ext] || "text/plain";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log("");
  console.log("  ┌─────────────────────────────────────────┐");
  console.log("  │  💬 FinChat Server                      │");
  console.log(`  │  Local:  http://localhost:${PORT}           │`);
  console.log(
    `  │  API Key: ${API_KEY ? "✅ Configured" : "❌ Missing"}                  │`,
  );
  console.log("  └─────────────────────────────────────────┘");
  console.log("");
});

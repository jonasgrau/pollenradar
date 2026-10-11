// Minimal static file server for local development
//
//   node scripts/serve.js [directory] [port]

const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(process.argv[2] || "public");
const PORT = Number(process.argv[3] || process.env.PORT || 8080);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    const file = path.resolve(ROOT, "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Nicht gefunden");
    }
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT} -> ${ROOT}`));

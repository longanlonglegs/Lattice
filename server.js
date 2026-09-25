const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".wasm": "application/wasm" };

http.createServer((req, res) => {
  const url = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const file = path.join(root, url);
  if (!file.startsWith(root) || !fs.existsSync(file)) {
    res.writeHead(404); res.end("Not found"); return;
  }
  res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 4173, "127.0.0.1", () => console.log("Lattice is running at http://localhost:4173"));

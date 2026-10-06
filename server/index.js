const http = require("http");
const fs = require("fs");
const path = require("path");
const { analyzeEvidence } = require("./routes/analysis");
const { extractCards } = require("./routes/extract");
const { fetchSource } = require("./routes/fetch-source");
const { lookupDoiRoute } = require("./routes/lookup-doi");
const { splitHypothesis } = require("./routes/hypothesis");
const { embedTexts, relatePairs } = require("./routes/relations");

const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".wasm": "application/wasm" };

http.createServer((req, res) => {
  const pathname = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  if (req.method === "POST" && pathname === "/api/evidence-analysis") return analyzeEvidence(req, res);
  if (req.method === "POST" && pathname === "/api/extract-cards") return extractCards(req, res);
  if (req.method === "POST" && pathname === "/api/fetch-source") return fetchSource(req, res);
  if (req.method === "POST" && pathname === "/api/lookup-doi") return lookupDoiRoute(req, res);
  if (req.method === "POST" && pathname === "/api/split-hypothesis") return splitHypothesis(req, res);
  if (req.method === "POST" && pathname === "/api/embed") return embedTexts(req, res);
  if (req.method === "POST" && pathname === "/api/relate") return relatePairs(req, res);

  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("Not found"); return;
  }
  res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 4173, "127.0.0.1", () => console.log(`Lattice is running at http://localhost:${process.env.PORT || 4173}`));

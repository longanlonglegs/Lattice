const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".wasm": "application/wasm" };

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "confidence", "tensions", "next_actions"],
  properties: {
    summary: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    tensions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "explanation", "evidence_ids"],
        properties: {
          title: { type: "string" },
          explanation: { type: "string" },
          evidence_ids: { type: "array", items: { type: "string" } }
        }
      }
    },
    next_actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "reason", "priority"],
        properties: {
          action: { type: "string" },
          reason: { type: "string" },
          priority: { type: "string", enum: ["now", "next", "later"] }
        }
      }
    }
  }
};

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text")
    .map(item => item.text || "")
    .join("");
}

function validEvidence(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 12) return null;
  const evidence = input.map(item => ({
    id: String(item?.id || "").slice(0, 80),
    quote: String(item?.quote || "").trim().slice(0, 4000),
    page: String(item?.page || "").trim().slice(0, 250),
    stance: String(item?.stance || "unclassified").trim().slice(0, 40)
  }));
  return evidence.every(item => item.id && item.quote && item.page) ? evidence : null;
}

async function analyzeEvidence(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 503, { error: "AI is not configured. Start Lattice with OPENAI_API_KEY set on the local server." });
    return;
  }

  try {
    const body = await readJson(req);
    const question = String(body.question || "").trim().slice(0, 8000);
    const hypothesis = String(body.hypothesis || "").trim().slice(0, 8000);
    const evidence = validEvidence(body.evidence);
    if (!question || !evidence) {
      sendJson(res, 400, { error: "Add a research question and at least one source-anchored passage before running an analysis." });
      return;
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions: "You are Lattice's evidence analyst. Use only the supplied passages. Do not claim unprovided literature knowledge, originality, or consensus. Do not invent citations, quotations, source text, or factual claims. Treat the passages as incomplete. Reference only supplied evidence IDs in every tension. Suggest concrete next research actions, not facts. Keep the analysis concise and state confidence based only on the supplied evidence.",
        input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({ research_question: question, working_hypothesis: hypothesis || "Not provided", evidence }) }] }],
        text: { format: { type: "json_schema", name: "lattice_evidence_analysis", strict: true, schema: analysisSchema } }
      })
    });

    if (!response.ok) {
      sendJson(res, 502, { error: "The AI provider could not complete the analysis. Check the local API key and try again." });
      return;
    }

    const result = JSON.parse(outputText(await response.json()));
    const evidenceIds = new Set(evidence.map(item => item.id));
    result.tensions = (result.tensions || []).map(tension => ({
      ...tension,
      evidence_ids: (tension.evidence_ids || []).filter(id => evidenceIds.has(id))
    }));
    sendJson(res, 200, { analysis: result });
  } catch {
    sendJson(res, 500, { error: "Lattice could not prepare that analysis. Check the evidence and try again." });
  }
}

http.createServer((req, res) => {
  const pathname = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  if (req.method === "POST" && pathname === "/api/evidence-analysis") return analyzeEvidence(req, res);

  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("Not found"); return;
  }
  res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 4173, "127.0.0.1", () => console.log("Lattice is running at http://localhost:4173"));

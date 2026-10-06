// Shared test helpers: fake HTTP request/response objects and an OpenAI stub.
const { EventEmitter } = require("node:events");

// Calls a route handler with a JSON body and resolves with what it sent back.
function callRoute(handler, body) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.destroy = () => {};
    const res = {
      status: 0,
      writeHead(status) { this.status = status; },
      end(text) { resolve({ status: this.status, body: JSON.parse(text) }); }
    };
    Promise.resolve(handler(req, res)).catch(reject);
    setImmediate(() => {
      req.emit("data", typeof body === "string" ? body : JSON.stringify(body));
      req.emit("end");
    });
  });
}

// Replaces global fetch so tests never reach OpenAI. `reply(request)` returns the
// object the model would have produced, or a { status } to simulate a provider error.
function stubOpenAI(t, reply) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url !== "https://api.openai.com/v1/responses") throw new Error(`Unexpected fetch in test: ${url}`);
    const request = JSON.parse(options.body);
    request.payload = JSON.parse(request.input[0].content[0].text);
    calls.push(request);
    const result = reply(request);
    if (result?.status) return { ok: false, status: result.status, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ output_text: JSON.stringify(result) }) };
  };
  const hadKey = "OPENAI_API_KEY" in process.env;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  t.after(() => {
    globalThis.fetch = realFetch;
    if (hadKey) process.env.OPENAI_API_KEY = oldKey; else delete process.env.OPENAI_API_KEY;
  });
  return calls;
}

// Runs a test body with OPENAI_API_KEY unset.
function withoutKey(t) {
  const hadKey = "OPENAI_API_KEY" in process.env;
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  t.after(() => { if (hadKey) process.env.OPENAI_API_KEY = oldKey; });
}

module.exports = { callRoute, stubOpenAI, withoutKey };

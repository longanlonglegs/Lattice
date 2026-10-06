/* ---------- OpenAI client ---------- */

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text")
    .map(item => item.text || "")
    .join("");
}

async function callOpenAI(instructions, payload, name, schema) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions,
      input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(payload) }] }],
      text: { format: { type: "json_schema", name, strict: true, schema } }
    })
  });
  if (!response.ok) {
    const error = new Error("provider");
    error.provider = true;
    throw error;
  }
  return JSON.parse(outputText(await response.json()));
}

// Embeds a batch of texts with text-embedding-3-small (512 dimensions keeps stored vectors small).
async function callEmbeddings(texts) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small", input: texts, dimensions: 512 })
  });
  if (!response.ok) {
    const error = new Error("provider");
    error.provider = true;
    throw error;
  }
  const body = await response.json();
  return body.data.slice().sort((a, b) => a.index - b.index).map(item => item.embedding);
}

/* ---------- Response schemas ---------- */

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

const cardsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["source_info", "cards"],
  properties: {
    source_info: {
      type: "object",
      additionalProperties: false,
      required: ["title", "authors", "year", "venue", "doi"],
      properties: {
        title: { type: "string" },
        authors: { type: "array", items: { type: "string" } },
        year: { type: "string" },
        venue: { type: "string" },
        doi: { type: "string" }
      }
    },
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "quote", "page"],
        properties: {
          claim: { type: "string" },
          quote: { type: "string" },
          page: { type: "string" }
        }
      }
    }
  }
};

const guessesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["guesses"],
  properties: {
    guesses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["guess", "quote"],
        properties: { guess: { type: "string" }, quote: { type: "string" } }
      }
    }
  }
};

const relationsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "relation", "direction", "confidence", "rationale"],
        properties: {
          id: { type: "string" },
          relation: { type: "string", enum: ["supports", "contradicts", "refines", "same", "explains", "none"] },
          direction: { type: "string", enum: ["a_to_b", "b_to_a", "none"] },
          confidence: { type: "number" },
          rationale: { type: "string" }
        }
      }
    }
  }
};

module.exports = { callOpenAI, callEmbeddings, analysisSchema, cardsSchema, guessesSchema, relationsSchema };

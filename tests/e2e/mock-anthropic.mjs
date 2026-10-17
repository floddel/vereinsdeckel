/**
 * Nur für die Ende-zu-Ende-Tests: tut so, als wäre es die Anthropic-API (Port 3199).
 * Es wird nichts ins Internet geschickt und nichts kostet Geld.
 * - GET  /v1/models    → 200 nur mit dem Test-Schlüssel, sonst 401
 * - POST /v1/messages  → erkennt einen festen „Kassenbon“ (Tool-Aufruf wie bei der echten API)
 */
import { createServer } from "node:http";
import { TEST_KEY } from "./ai-test-key.mjs";
const PORT = Number(process.env.MOCK_ANTHROPIC_PORT ?? 3199);

/** Artikel-IDs aus der Liste im Prompt suchen (Zeilen wie „- id=… · Pils 0,33 · …“). */
function idOf(prompt, name) {
  const m = new RegExp(`id=([0-9a-f-]{36}) · ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ·`).exec(prompt);
  return m ? m[1] : null;
}

createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.headers["x-api-key"] !== TEST_KEY) return send(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
  if (req.method === "GET" && req.url?.startsWith("/v1/models")) return send(200, { data: [{ id: "claude-test" }], has_more: false });
  if (req.method === "POST" && req.url === "/v1/messages") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const prompt = body.messages[0].content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    const hasImage = body.messages[0].content.some((c) => c.type === "image" && c.source?.data);
    if (!hasImage) return send(400, { type: "error", error: { type: "invalid_request_error", message: "image missing" } });
    const tool = body.tools[0].name;
    return send(200, {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: body.model,
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "toolu_test",
          name: tool,
          input: {
            haendler: "Metro Teststadt",
            datum: "2026-10-14",
            summe_cents: 4796,
            positionen: [
              { bon_text: "KROMB.PILS 20X0,5L", menge: 2, gesamt_cents: 3398, artikel_id: idOf(prompt, "Pils 0,33"), stueck_je_menge: 20, flasche_ml: null },
              { bon_text: "GRILLKOHLE 3KG", menge: 1, gesamt_cents: 499, artikel_id: null, stueck_je_menge: null, flasche_ml: null },
              { bon_text: "PFAND", menge: 1, gesamt_cents: 899, artikel_id: null, stueck_je_menge: null, flasche_ml: null },
            ],
          },
        },
      ],
      usage: { input_tokens: 1500, output_tokens: 300 },
    });
  }
  send(404, { type: "error", error: { type: "not_found_error", message: "not found" } });
}).listen(PORT, () => console.log(`Mock-Anthropic auf Port ${PORT}`));

// Vercel serverless function for POST /api/chat.
//
// Unlike backend/server.js (a persistent process with an in-memory
// sessions Map), each call here may run in a fresh, isolated instance
// with no memory of any previous request — so there is no server-side
// order/session state. Every call starts from a brand-new empty order
// (see createOrder()) purely so CafeBot's grounded prompt has a valid
// "current order" section to reference; it's always empty here.
// Conversation continuity for the chat itself comes from the `history`
// array the client already sends with each request, not from this
// function remembering anything.
//
// The order-building endpoints (/api/order/*, /api/staff/*) are NOT
// ported here on purpose — they fundamentally need shared state across
// calls (add an item, then confirm), which serverless functions can't
// provide without an external datastore. Those only exist on the full
// backend (backend/server.js), run locally or deployed to a host that
// keeps a persistent process (see backend/README.md).

const fs = require("fs");
const path = require("path");
const { createOrder, summarizeOrder } = require("../../backend/orderState");
const { buildGroundedSystemPrompt, generateReply } = require("../../backend/aiReply");

const SYSTEM_PROMPT_PATH = path.join(__dirname, "..", "..", "prompts", "system-prompt.md");

let systemPrompt;
try {
  systemPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8");
} catch (err) {
  console.error(`Failed to load system prompt from ${SYSTEM_PROMPT_PATH}: ${err.message}`);
  systemPrompt = null;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (systemPrompt === null) {
    res.status(500).json({ error: "System prompt could not be loaded" });
    return;
  }

  const { message, history } = req.body || {};

  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "'message' is required and must be a non-empty string" });
    return;
  }

  if (history !== undefined && !Array.isArray(history)) {
    res.status(400).json({ error: "'history' must be an array if provided" });
    return;
  }

  const order = createOrder();
  const reply = await generateReply(
    buildGroundedSystemPrompt(systemPrompt, order),
    history || [],
    message.trim()
  );

  res.status(200).json({
    reply,
    order,
    orderSummary: summarizeOrder(order),
    promotionMessage: null,
  });
};

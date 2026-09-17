// Minimal CafeBot backend. No framework and no SDK dependency — a chat
// endpoint that loads CafeBot's system instructions from
// prompts/system-prompt.md, grounds them with the current menu,
// promotions, and order, and calls Anthropic's Messages API (via the
// built-in fetch) for the reply, plus endpoints to add, modify, and
// remove valid menu items on a session's
// order, read back a concise summary of it, get simple rule-based
// recommendations (grounded only in data/menu.json, max 2 items, never
// pushy), apply active, currently-eligible promotions from
// data/promotions.json (never invented, never inactive/ineligible ones),
// select pickup with a customer name (required) and pickup time
// (optional), select delivery with a name, phone, and address
// (required) plus apartment/unit and delivery instructions (optional) —
// nothing is ever guessed — and, for delivery, require the customer to
// explicitly confirm or correct the full address before checkout. All
// order totals (subtotal/tax/deliveryFee/total) are computed
// deterministically in pricing.js from menu prices and quantities —
// never by the language model. A complete structured order summary
// (items, fulfillment, valid promotions, pricing) is available before
// checkout via orderSummary.js, and an order is only ever marked
// confirmed through the confirmation gate in confirmation.js — it
// requires the order to be checkout-ready and an unambiguous, exact
// affirmative reply; declines and ambiguous replies never confirm it.
// The moment (and only the moment) that gate confirms an order, it's
// saved to data/orders.json (orderStorage.js) with a unique orderId,
// timestamp, and status — a draft is never saved as if it were placed.
// A small set of staff endpoints (/api/staff/orders) list those saved
// orders and let staff move one through its status lifecycle.

const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  getOrCreateSession,
  addItemToOrder,
  updateOrderItem,
  removeOrderItem,
  setPickupDetails,
  setDeliveryDetails,
  confirmDeliveryAddress,
  summarizeOrder,
} = require("./orderState");
const { getRecommendations, formatRecommendationMessage } = require("./recommendations");
const { getEligiblePromotions, formatPromotionMessage } = require("./promotionEngine");
const { getAllMenuItems } = require("./menu");
const { getActivePromotions } = require("./promotions");
const { getFaqData } = require("./faq");
const { buildOrderSummary } = require("./orderSummary");
const { confirmOrder } = require("./confirmation");
const { getAllOrders, updateOrderStatus } = require("./orderStorage");

// No dotenv dependency (kept dependency-free on purpose) — read .env
// ourselves. Values already set in the real environment (e.g. by a
// hosting platform) always win over the file.
function loadEnvFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`Failed to read env file ${filePath}: ${err.message}`);
    }
    return;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "claude-haiku-4-5-20251001";
const AI_API_BASE_URL = process.env.AI_API_BASE_URL || "https://api.anthropic.com";
const AI_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 512;
const SYSTEM_PROMPT_PATH = path.join(__dirname, "..", "prompts", "system-prompt.md");

let systemPrompt;
try {
  systemPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8");
} catch (err) {
  console.error(`Failed to load system prompt from ${SYSTEM_PROMPT_PATH}: ${err.message}`);
  systemPrompt = null;
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Appends the current menu, active promotions, and order summary to
// CafeBot's system instructions, so the model only ever answers from
// real data instead of guessing (per prompts/system-prompt.md's "menu
// & data usage" and "promotions" rules).
function buildGroundedSystemPrompt(order) {
  const menuItems = getAllMenuItems();
  const activePromotions = getActivePromotions().map((promotion) => ({
    id: promotion.id,
    name: promotion.name,
    rule: promotion.rule,
  }));
  const faqData = getFaqData();

  return `${systemPrompt}

---
## Menu data (source of truth — data/menu.json)
${JSON.stringify(menuItems)}

## Active promotions (source of truth — data/promotions.json)
${JSON.stringify(activePromotions)}

## Cafe FAQ data (source of truth — data/faq.json): hours, location, wifi
${JSON.stringify(faqData)}

## Customer's current order (already priced — never recalculate)
${summarizeOrder(order)}`;
}

// Calls Anthropic's Messages API for CafeBot's reply. Falls back to a
// plain apology message (never a fabricated answer) if the key is
// missing or the request fails for any reason.
async function generateReply(systemPromptText, history, message) {
  if (!ANTHROPIC_API_KEY) {
    return "CafeBot's AI isn't configured yet — an administrator needs to set ANTHROPIC_API_KEY in the backend's .env file.";
  }

  const messages = (history || [])
    .filter(
      (entry) =>
        entry &&
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string"
    )
    .map((entry) => ({ role: entry.role, content: entry.content }));
  messages.push({ role: "user", content: message });

  try {
    const response = await fetch(`${AI_API_BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        system: systemPromptText,
        messages,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(
        `Anthropic API error (${response.status}): ${data.error ? data.error.message : "unknown error"}`
      );
      return "Sorry, I'm having trouble reaching my AI service right now. Please try again in a moment, or ask a staff member for help.";
    }

    const textBlock = (data.content || []).find((block) => block.type === "text");
    return textBlock ? textBlock.text : "Sorry, I couldn't come up with a reply just now — could you try rephrasing?";
  } catch (err) {
    console.error(`Failed to reach Anthropic API: ${err.message}`);
    return "Sorry, I'm having trouble reaching my AI service right now. Please try again in a moment, or ask a staff member for help.";
  }
}

async function handleChat(req, res) {
  let parsed;
  try {
    parsed = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const { message, history, sessionId: requestedSessionId } = parsed;

  if (typeof message !== "string" || !message.trim()) {
    return sendJson(res, 400, { error: "'message' is required and must be a non-empty string" });
  }

  if (history !== undefined && !Array.isArray(history)) {
    return sendJson(res, 400, { error: "'history' must be an array if provided" });
  }

  if (requestedSessionId !== undefined && typeof requestedSessionId !== "string") {
    return sendJson(res, 400, { error: "'sessionId' must be a string if provided" });
  }

  if (systemPrompt === null) {
    return sendJson(res, 500, { error: "System prompt could not be loaded" });
  }

  const { sessionId, order } = getOrCreateSession(requestedSessionId);
  const reply = await generateReply(buildGroundedSystemPrompt(order), history || [], message.trim());

  sendJson(res, 200, {
    reply,
    sessionId,
    order,
    orderSummary: summarizeOrder(order),
    promotionMessage: formatPromotionMessage(order),
  });
}

async function handleAddOrderItem(req, res) {
  let parsed;
  try {
    parsed = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const { sessionId: requestedSessionId, itemId, size, options, quantity } = parsed;

  if (typeof requestedSessionId !== "string" || !requestedSessionId.trim()) {
    return sendJson(res, 400, { error: "'sessionId' is required and must be a string" });
  }

  if (typeof itemId !== "string" || !itemId.trim()) {
    return sendJson(res, 400, { error: "'itemId' is required and must be a string" });
  }

  if (size !== undefined && typeof size !== "string") {
    return sendJson(res, 400, { error: "'size' must be a string if provided" });
  }

  if (quantity !== undefined && typeof quantity !== "number") {
    return sendJson(res, 400, { error: "'quantity' must be a number if provided" });
  }

  const { sessionId, order } = getOrCreateSession(requestedSessionId);
  const result = addItemToOrder(order, { itemId, size, options, quantity });

  if (result.error) {
    return sendJson(res, 400, { error: result.error, sessionId, order, orderSummary: summarizeOrder(order) });
  }

  if (result.needsInput) {
    return sendJson(res, 200, {
      needsInput: result.needsInput,
      message: result.message,
      sessionId,
      order,
      orderSummary: summarizeOrder(order),
    });
  }

  const recommendations = getRecommendations(result.order);
  sendJson(res, 200, {
    sessionId,
    order: result.order,
    orderSummary: summarizeOrder(result.order),
    promotionMessage: formatPromotionMessage(result.order),
    recommendations,
    recommendationMessage: formatRecommendationMessage(recommendations),
  });
}

async function handleUpdateOrderItem(req, res) {
  let parsed;
  try {
    parsed = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const { sessionId: requestedSessionId, itemIndex, quantity, size, options } = parsed;

  if (typeof requestedSessionId !== "string" || !requestedSessionId.trim()) {
    return sendJson(res, 400, { error: "'sessionId' is required and must be a string" });
  }

  if (typeof itemIndex !== "number") {
    return sendJson(res, 400, { error: "'itemIndex' is required and must be a number" });
  }

  if (size !== undefined && typeof size !== "string") {
    return sendJson(res, 400, { error: "'size' must be a string if provided" });
  }

  if (quantity !== undefined && typeof quantity !== "number") {
    return sendJson(res, 400, { error: "'quantity' must be a number if provided" });
  }

  const { sessionId, order } = getOrCreateSession(requestedSessionId);
  const result = updateOrderItem(order, { itemIndex, quantity, size, options });

  if (result.error) {
    return sendJson(res, 400, { error: result.error, sessionId, order, orderSummary: summarizeOrder(order) });
  }

  sendJson(res, 200, {
    sessionId,
    order: result.order,
    orderSummary: summarizeOrder(result.order),
    promotionMessage: formatPromotionMessage(result.order),
  });
}

async function handleRemoveOrderItem(req, res) {
  let parsed;
  try {
    parsed = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const { sessionId: requestedSessionId, itemIndex } = parsed;

  if (typeof requestedSessionId !== "string" || !requestedSessionId.trim()) {
    return sendJson(res, 400, { error: "'sessionId' is required and must be a string" });
  }

  if (typeof itemIndex !== "number") {
    return sendJson(res, 400, { error: "'itemIndex' is required and must be a number" });
  }

  const { sessionId, order } = getOrCreateSession(requestedSessionId);
  const result = removeOrderItem(order, { itemIndex });

  if (result.error) {
    return sendJson(res, 400, { error: result.error, sessionId, order, orderSummary: summarizeOrder(order) });
  }

  sendJson(res, 200, {
    sessionId,
    order: result.order,
    orderSummary: summarizeOrder(result.order),
    promotionMessage: formatPromotionMessage(result.order),
  });
}

async function handleSetPickupDetails(req, res) {
  let parsed;
  try {
    parsed = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const { sessionId: requestedSessionId, customerName, pickupTime } = parsed;

  if (typeof requestedSessionId !== "string" || !requestedSessionId.trim()) {
    return sendJson(res, 400, { error: "'sessionId' is required and must be a string" });
  }

  if (customerName !== undefined && typeof customerName !== "string") {
    return sendJson(res, 400, { error: "'customerName' must be a string if provided" });
  }

  if (pickupTime !== undefined && typeof pickupTime !== "string") {
    return sendJson(res, 400, { error: "'pickupTime' must be a string if provided" });
  }

  const { sessionId, order } = getOrCreateSession(requestedSessionId);
  const result = setPickupDetails(order, { customerName, pickupTime });

  if (result.error) {
    return sendJson(res, 400, { error: result.error, sessionId, order, orderSummary: summarizeOrder(order) });
  }

  if (result.needsInput) {
    return sendJson(res, 200, {
      needsInput: result.needsInput,
      message: result.message,
      sessionId,
      order: result.order,
      orderSummary: summarizeOrder(result.order),
    });
  }

  sendJson(res, 200, {
    sessionId,
    order: result.order,
    orderSummary: summarizeOrder(result.order),
  });
}

async function handleSetDeliveryDetails(req, res) {
  let parsed;
  try {
    parsed = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const {
    sessionId: requestedSessionId,
    customerName,
    phone,
    address,
    apartmentUnit,
    deliveryInstructions,
  } = parsed;

  if (typeof requestedSessionId !== "string" || !requestedSessionId.trim()) {
    return sendJson(res, 400, { error: "'sessionId' is required and must be a string" });
  }

  if (customerName !== undefined && typeof customerName !== "string") {
    return sendJson(res, 400, { error: "'customerName' must be a string if provided" });
  }

  if (phone !== undefined && typeof phone !== "string") {
    return sendJson(res, 400, { error: "'phone' must be a string if provided" });
  }

  if (address !== undefined && typeof address !== "string") {
    return sendJson(res, 400, { error: "'address' must be a string if provided" });
  }

  if (apartmentUnit !== undefined && typeof apartmentUnit !== "string") {
    return sendJson(res, 400, { error: "'apartmentUnit' must be a string if provided" });
  }

  if (deliveryInstructions !== undefined && typeof deliveryInstructions !== "string") {
    return sendJson(res, 400, { error: "'deliveryInstructions' must be a string if provided" });
  }

  const { sessionId, order } = getOrCreateSession(requestedSessionId);
  const result = setDeliveryDetails(order, {
    customerName,
    phone,
    address,
    apartmentUnit,
    deliveryInstructions,
  });

  if (result.error) {
    return sendJson(res, 400, { error: result.error, sessionId, order, orderSummary: summarizeOrder(order) });
  }

  if (result.needsInput) {
    return sendJson(res, 200, {
      needsInput: result.needsInput,
      missingFields: result.missingFields,
      message: result.message,
      sessionId,
      order: result.order,
      orderSummary: summarizeOrder(result.order),
    });
  }

  sendJson(res, 200, {
    sessionId,
    order: result.order,
    orderSummary: summarizeOrder(result.order),
  });
}

async function handleConfirmDeliveryAddress(req, res) {
  let parsed;
  try {
    parsed = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const { sessionId: requestedSessionId, confirmed, correctedAddress } = parsed;

  if (typeof requestedSessionId !== "string" || !requestedSessionId.trim()) {
    return sendJson(res, 400, { error: "'sessionId' is required and must be a string" });
  }

  if (confirmed !== undefined && typeof confirmed !== "boolean") {
    return sendJson(res, 400, { error: "'confirmed' must be a boolean if provided" });
  }

  if (correctedAddress !== undefined && typeof correctedAddress !== "string") {
    return sendJson(res, 400, { error: "'correctedAddress' must be a string if provided" });
  }

  const { sessionId, order } = getOrCreateSession(requestedSessionId);
  const result = confirmDeliveryAddress(order, { confirmed, correctedAddress });

  if (result.error) {
    return sendJson(res, 400, { error: result.error, sessionId, order, orderSummary: summarizeOrder(order) });
  }

  if (result.needsInput) {
    return sendJson(res, 200, {
      needsInput: result.needsInput,
      message: result.message,
      sessionId,
      order: result.order,
      orderSummary: summarizeOrder(result.order),
    });
  }

  sendJson(res, 200, {
    sessionId,
    order: result.order,
    orderSummary: summarizeOrder(result.order),
  });
}

async function handleGetOrderSummary(req, res) {
  const requestedSessionId = new URL(req.url, "http://localhost").searchParams.get("sessionId");

  if (!requestedSessionId) {
    return sendJson(res, 400, { error: "'sessionId' query parameter is required" });
  }

  const { sessionId, order } = getOrCreateSession(requestedSessionId);
  sendJson(res, 200, { sessionId, order, orderSummary: summarizeOrder(order) });
}

async function handleGetRecommendations(req, res) {
  const requestedSessionId = new URL(req.url, "http://localhost").searchParams.get("sessionId");

  if (!requestedSessionId) {
    return sendJson(res, 400, { error: "'sessionId' query parameter is required" });
  }

  const { sessionId, order } = getOrCreateSession(requestedSessionId);
  const recommendations = getRecommendations(order);
  sendJson(res, 200, {
    sessionId,
    recommendations,
    recommendationMessage: formatRecommendationMessage(recommendations),
  });
}

async function handleGetPromotions(req, res) {
  const requestedSessionId = new URL(req.url, "http://localhost").searchParams.get("sessionId");

  if (!requestedSessionId) {
    return sendJson(res, 400, { error: "'sessionId' query parameter is required" });
  }

  const { sessionId, order } = getOrCreateSession(requestedSessionId);
  const eligiblePromotions = getEligiblePromotions(order).map((promotion) => ({
    id: promotion.id,
    name: promotion.name,
    rule: promotion.rule,
  }));

  sendJson(res, 200, {
    sessionId,
    eligiblePromotions,
    appliedPromotion: order.promotion,
    promotionMessage: formatPromotionMessage(order),
  });
}

async function handleGetCheckoutSummary(req, res) {
  const requestedSessionId = new URL(req.url, "http://localhost").searchParams.get("sessionId");

  if (!requestedSessionId) {
    return sendJson(res, 400, { error: "'sessionId' query parameter is required" });
  }

  const { sessionId, order } = getOrCreateSession(requestedSessionId);
  sendJson(res, 200, {
    sessionId,
    checkoutSummary: buildOrderSummary(order),
    orderSummary: summarizeOrder(order),
  });
}

async function handleConfirmOrder(req, res) {
  let parsed;
  try {
    parsed = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const { sessionId: requestedSessionId, reply } = parsed;

  if (typeof requestedSessionId !== "string" || !requestedSessionId.trim()) {
    return sendJson(res, 400, { error: "'sessionId' is required and must be a string" });
  }

  if (reply !== undefined && typeof reply !== "string") {
    return sendJson(res, 400, { error: "'reply' must be a string if provided" });
  }

  const { sessionId, order } = getOrCreateSession(requestedSessionId);
  const result = confirmOrder(order, { reply, sessionId });

  if (result.error) {
    return sendJson(res, 400, {
      error: result.error,
      sessionId,
      order,
      orderSummary: summarizeOrder(order),
      checkoutSummary: buildOrderSummary(order),
    });
  }

  if (result.needsInput) {
    return sendJson(res, 200, {
      needsInput: result.needsInput,
      message: result.message,
      blockers: result.blockers,
      sessionId,
      order: result.order,
      orderSummary: summarizeOrder(result.order),
      checkoutSummary: buildOrderSummary(result.order),
    });
  }

  sendJson(res, 200, {
    sessionId,
    order: result.order,
    orderSummary: summarizeOrder(result.order),
    checkoutSummary: buildOrderSummary(result.order),
    saved: result.saved,
  });
}

async function handleGetMenu(req, res) {
  sendJson(res, 200, {
    items: getAllMenuItems(),
    activePromotions: getActivePromotions().map((promotion) => ({
      id: promotion.id,
      name: promotion.name,
      rule: promotion.rule,
    })),
  });
}

async function handleGetFaq(req, res) {
  sendJson(res, 200, getFaqData());
}

async function handleGetStaffOrders(req, res) {
  sendJson(res, 200, { orders: getAllOrders() });
}

async function handleUpdateStaffOrderStatus(req, res, orderId) {
  let parsed;
  try {
    parsed = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const { status } = parsed;

  if (typeof status !== "string" || !status.trim()) {
    return sendJson(res, 400, { error: "'status' is required and must be a string" });
  }

  const result = updateOrderStatus(orderId, status);

  if (result.error) {
    return sendJson(res, 400, { error: result.error });
  }

  sendJson(res, 200, { order: result.record });
}

const STAFF_ORDER_PREFIX = "/api/staff/orders/";

const server = http.createServer((req, res) => {
  const pathname = req.url.split("?")[0];

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  if (req.method === "POST" && pathname === "/api/chat") {
    return handleChat(req, res);
  }
  if (req.method === "POST" && pathname === "/api/order/items") {
    return handleAddOrderItem(req, res);
  }
  if (req.method === "PATCH" && pathname === "/api/order/items") {
    return handleUpdateOrderItem(req, res);
  }
  if (req.method === "DELETE" && pathname === "/api/order/items") {
    return handleRemoveOrderItem(req, res);
  }
  if (req.method === "POST" && pathname === "/api/order/pickup") {
    return handleSetPickupDetails(req, res);
  }
  if (req.method === "POST" && pathname === "/api/order/delivery") {
    return handleSetDeliveryDetails(req, res);
  }
  if (req.method === "POST" && pathname === "/api/order/delivery/confirm-address") {
    return handleConfirmDeliveryAddress(req, res);
  }
  if (req.method === "GET" && pathname === "/api/order/summary") {
    return handleGetOrderSummary(req, res);
  }
  if (req.method === "GET" && pathname === "/api/order/recommendations") {
    return handleGetRecommendations(req, res);
  }
  if (req.method === "GET" && pathname === "/api/order/promotions") {
    return handleGetPromotions(req, res);
  }
  if (req.method === "GET" && pathname === "/api/order/checkout-summary") {
    return handleGetCheckoutSummary(req, res);
  }
  if (req.method === "POST" && pathname === "/api/order/confirm") {
    return handleConfirmOrder(req, res);
  }
  if (req.method === "GET" && pathname === "/api/menu") {
    return handleGetMenu(req, res);
  }
  if (req.method === "GET" && pathname === "/api/faq") {
    return handleGetFaq(req, res);
  }
  if (req.method === "GET" && pathname === "/api/staff/orders") {
    return handleGetStaffOrders(req, res);
  }
  if (req.method === "PATCH" && pathname.startsWith(STAFF_ORDER_PREFIX)) {
    const orderId = decodeURIComponent(pathname.slice(STAFF_ORDER_PREFIX.length));
    if (orderId) {
      return handleUpdateStaffOrderStatus(req, res, orderId);
    }
  }
  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`CafeBot backend listening on port ${PORT}`);
});

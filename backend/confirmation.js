// The confirmation gate. An order is only ever marked confirmed here,
// and only when both of these hold:
//   1. It's actually ready for checkout (see orderSummary.js) — the
//      customer has something to confirm in the first place.
//   2. Their reply is an unmistakable, exact affirmative from a fixed
//      allowlist. Anything else — a decline, an unmatched phrase, or an
//      empty reply — is treated as NOT a confirmation. Ambiguous
//      replies (e.g. "maybe", "sure", "ok", "I guess") never count.
// This is deterministic keyword matching, not left to the language
// model to judge — the same reasoning as never letting it invent prices.
// Only a genuine confirmation ever gets saved to data/orders.json (see
// orderStorage.js) — a draft is never written as if it were placed.

const { getCheckoutBlockers } = require("./orderSummary");
const { saveConfirmedOrder } = require("./orderStorage");

const CONFIRM_PHRASES = new Set([
  "yes",
  "yes please",
  "yep",
  "yeah",
  "yup",
  "y",
  "correct",
  "that is correct",
  "that's correct",
  "that is right",
  "that's right",
  "looks right",
  "looks good",
  "sounds good",
  "confirm",
  "confirmed",
  "confirm order",
  "confirm the order",
  "place the order",
  "place order",
  "go ahead",
  "all good",
  "perfect, confirm",
  "i confirm",
]);

const DECLINE_PHRASES = new Set([
  "no",
  "nope",
  "nah",
  "not yet",
  "cancel",
  "stop",
  "wait",
  "hold on",
  "no thanks",
  "not correct",
  "that's wrong",
  "that is wrong",
  "incorrect",
  "don't confirm",
]);

function normalize(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/g, "");
}

// "confirmed" | "declined" | "ambiguous". Anything not an exact match to
// a known phrase is ambiguous, including empty replies, hedged replies
// ("I guess", "probably", "sure"), and unrelated text.
function classifyReply(reply) {
  const normalized = normalize(reply);
  if (!normalized) return "ambiguous";
  if (CONFIRM_PHRASES.has(normalized)) return "confirmed";
  if (DECLINE_PHRASES.has(normalized)) return "declined";
  return "ambiguous";
}

// Attempts to confirm (finalize) an order, and — only on a genuine
// confirmation — saves it to data/orders.json. Returns one of:
//   { error: string }                                  - invalid input
//   { needsInput: "orderIncomplete", blockers, message, order } - not ready to confirm
//   { needsInput: "orderChanges", message, order }      - customer declined
//   { needsInput: "confirmation", message, order }      - ambiguous reply, not confirmed
//   { order, saved }                                     - confirmed and saved
function confirmOrder(order, { reply, sessionId } = {}) {
  if (typeof reply !== "string" || !reply.trim()) {
    return { error: "'reply' is required and must be a non-empty string." };
  }

  const blockers = getCheckoutBlockers(order);
  if (blockers.length) {
    return {
      needsInput: "orderIncomplete",
      blockers,
      message: `This order isn't ready to confirm yet: ${blockers.join(" ")}`,
      order,
    };
  }

  const classification = classifyReply(reply);

  if (classification === "confirmed") {
    order.confirmed = true;
    order.status = "confirmed";

    const saved = saveConfirmedOrder(order, { sessionId });
    order.orderId = saved.orderId;
    order.confirmedAt = saved.timestamp;

    return { order, saved };
  }

  if (classification === "declined") {
    return {
      needsInput: "orderChanges",
      message: "No problem — what would you like to change?",
      order,
    };
  }

  return {
    needsInput: "confirmation",
    message:
      'I didn\'t quite catch that. Could you clearly say "yes" to confirm this order as shown, or "no" if you\'d like to change something?',
    order,
  };
}

module.exports = { confirmOrder, classifyReply };

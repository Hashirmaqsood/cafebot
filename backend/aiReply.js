// Builds CafeBot's grounded system prompt and calls Anthropic's
// Messages API for a reply. Shared by the local dev server
// (backend/server.js) and the Vercel serverless functions
// (frontend/api/*.js) so there's one implementation of the AI call,
// not two. Config (API key, model, etc.) is read from process.env at
// call time, not at require time, so it works regardless of whether
// the caller loads a .env file before or after requiring this module.

const { getAllMenuItems } = require("./menu");
const { getActivePromotions } = require("./promotions");
const { getFaqData } = require("./faq");
const { summarizeOrder } = require("./orderState");

// Appends the current menu, active promotions, FAQ data, and order
// summary to CafeBot's system instructions, so the model only ever
// answers from real data instead of guessing (per
// prompts/system-prompt.md's "menu & data usage" and "promotions"
// rules).
function buildGroundedSystemPrompt(systemPromptText, order) {
  const menuItems = getAllMenuItems();
  const activePromotions = getActivePromotions().map((promotion) => ({
    id: promotion.id,
    name: promotion.name,
    rule: promotion.rule,
  }));
  const faqData = getFaqData();

  return `${systemPromptText}

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
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  const model = process.env.AI_MODEL || "claude-haiku-4-5-20251001";
  const apiBaseUrl = process.env.AI_API_BASE_URL || "https://api.anthropic.com";
  const maxTokens = Number(process.env.AI_MAX_TOKENS) || 512;

  if (!apiKey) {
    return "CafeBot's AI isn't configured yet — an administrator needs to set ANTHROPIC_API_KEY.";
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
    const response = await fetch(`${apiBaseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
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

module.exports = { buildGroundedSystemPrompt, generateReply };

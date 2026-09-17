// Vercel serverless function for GET /api/menu. Read-only, no session
// needed — reuses the same backend/menu.js and backend/promotions.js
// modules the local dev server (backend/server.js) uses, so there's
// one source of truth for menu/promotion data either way.

const { getAllMenuItems } = require("../../backend/menu");
const { getActivePromotions } = require("../../backend/promotions");

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  res.status(200).json({
    items: getAllMenuItems(),
    activePromotions: getActivePromotions().map((promotion) => ({
      id: promotion.id,
      name: promotion.name,
      rule: promotion.rule,
    })),
  });
};

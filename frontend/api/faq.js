// Vercel serverless function for GET /api/faq. Read-only, no session
// needed — reuses backend/faq.js, the same source of truth the local
// dev server (backend/server.js) uses.

const { getFaqData } = require("../../backend/faq");

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  res.status(200).json(getFaqData());
};

// Loads the FAQ data (hours, location, etc.) once — the same pattern as
// menu.js and promotions.js. Single source of truth for hours/location,
// used by both the homepage and CafeBot's grounded system prompt.

const fs = require("fs");
const path = require("path");

const FAQ_PATH = path.join(__dirname, "..", "data", "faq.json");

let faqData = null;
try {
  faqData = JSON.parse(fs.readFileSync(FAQ_PATH, "utf8"));
} catch (err) {
  console.error(`Failed to load FAQ data from ${FAQ_PATH}: ${err.message}`);
}

function getFaqData() {
  return faqData || {};
}

module.exports = { getFaqData };

// Loads the promotions data once and exposes only the active ones.
// Inactive/expired promotions (active: false) are never returned, so
// nothing downstream can apply or recommend them.

const fs = require("fs");
const path = require("path");

const PROMOTIONS_PATH = path.join(__dirname, "..", "data", "promotions.json");

let promotionsData = null;
try {
  promotionsData = JSON.parse(fs.readFileSync(PROMOTIONS_PATH, "utf8"));
} catch (err) {
  console.error(`Failed to load promotions from ${PROMOTIONS_PATH}: ${err.message}`);
}

function getActivePromotions() {
  if (!promotionsData) return [];
  return promotionsData.promotions.filter((promotion) => promotion.active === true);
}

module.exports = { getActivePromotions };

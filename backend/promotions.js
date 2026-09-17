// Loads the promotions data once and exposes only the active ones.
// Inactive/expired promotions (active: false) are never returned, so
// nothing downstream can apply or recommend them.
//
// Loaded via a literal require() (not fs.readFileSync + a
// runtime-built path) so bundlers — notably Vercel's serverless
// function bundler — can statically trace it and include the file
// automatically.

let promotionsData = null;
try {
  promotionsData = require("../data/promotions.json");
} catch (err) {
  console.error(`Failed to load promotions from data/promotions.json: ${err.message}`);
}

function getActivePromotions() {
  if (!promotionsData) return [];
  return promotionsData.promotions.filter((promotion) => promotion.active === true);
}

module.exports = { getActivePromotions };

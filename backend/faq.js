// Loads the FAQ data (hours, location, etc.) once — the same pattern as
// menu.js and promotions.js. Single source of truth for hours/location,
// used by both the homepage and CafeBot's grounded system prompt.
//
// Loaded via a literal require() (not fs.readFileSync + a
// runtime-built path) so bundlers — notably Vercel's serverless
// function bundler — can statically trace it and include the file
// automatically.

let faqData = null;
try {
  faqData = require("../data/faq.json");
} catch (err) {
  console.error(`Failed to load FAQ data from data/faq.json: ${err.message}`);
}

function getFaqData() {
  return faqData || {};
}

module.exports = { getFaqData };

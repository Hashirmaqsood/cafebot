// Loads the menu data once and exposes lookups used to validate items
// before they're added to an order, and to build recommendations.
//
// Loaded via a literal require() (not fs.readFileSync + a
// runtime-built path) so bundlers — notably Vercel's serverless
// function bundler (see frontend/api/menu.js and frontend/api/chat.js)
// — can statically trace it and include the file automatically.

let menu = null;
try {
  menu = require("../data/menu.json");
} catch (err) {
  console.error(`Failed to load menu from data/menu.json: ${err.message}`);
}

function findMenuItem(itemId) {
  if (!menu) return null;
  return menu.items.find((item) => item.id === itemId) || null;
}

function getAllMenuItems() {
  return menu ? menu.items : [];
}

module.exports = { findMenuItem, getAllMenuItems };

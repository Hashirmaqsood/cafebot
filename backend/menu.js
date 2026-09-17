// Loads the menu data once and exposes lookups used to validate items
// before they're added to an order, and to build recommendations.

const fs = require("fs");
const path = require("path");

const MENU_PATH = path.join(__dirname, "..", "data", "menu.json");

let menu = null;
try {
  menu = JSON.parse(fs.readFileSync(MENU_PATH, "utf8"));
} catch (err) {
  console.error(`Failed to load menu from ${MENU_PATH}: ${err.message}`);
}

function findMenuItem(itemId) {
  if (!menu) return null;
  return menu.items.find((item) => item.id === itemId) || null;
}

function getAllMenuItems() {
  return menu ? menu.items : [];
}

module.exports = { findMenuItem, getAllMenuItems };

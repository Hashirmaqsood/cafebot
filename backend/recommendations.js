// Simple, rule-based recommendations grounded only in data/menu.json.
// No AI involved: it just suggests a genuinely missing category (e.g. a
// drink to go with food, or vice versa), never more than 2 items, and
// never anything that isn't a real menu item.

const { findMenuItem, getAllMenuItems } = require("./menu");

const DRINK_CATEGORIES = ["coffee", "tea", "cold drinks"];
const FOOD_CATEGORIES = ["pastries", "sandwiches", "desserts"];
const MAX_RECOMMENDATIONS = 2;

function getRecommendations(order) {
  const menuItems = getAllMenuItems();
  const orderedIds = new Set(order.items.map((item) => item.id));
  const orderedCategories = new Set(
    order.items
      .map((item) => findMenuItem(item.id))
      .filter(Boolean)
      .map((menuItem) => menuItem.category)
  );

  const hasDrink = [...orderedCategories].some((c) => DRINK_CATEGORIES.includes(c));
  const hasFood = [...orderedCategories].some((c) => FOOD_CATEGORIES.includes(c));

  function firstAvailable(categories) {
    return menuItems.find(
      (item) => categories.includes(item.category) && !orderedIds.has(item.id)
    );
  }

  const recommendations = [];

  if (order.items.length === 0) {
    const drink = firstAvailable(DRINK_CATEGORIES);
    const food = firstAvailable(FOOD_CATEGORIES);
    if (drink) recommendations.push(drink);
    if (food) recommendations.push(food);
  } else {
    if (!hasFood) {
      const food = firstAvailable(FOOD_CATEGORIES);
      if (food) recommendations.push(food);
    }
    if (!hasDrink) {
      const drink = firstAvailable(DRINK_CATEGORIES);
      if (drink) recommendations.push(drink);
    }
  }

  return recommendations.slice(0, MAX_RECOMMENDATIONS).map((item) => ({
    id: item.id,
    name: item.name,
  }));
}

// Phrases recommendations as a gentle, optional suggestion — never a hard
// sell. Returns null when there's nothing worth suggesting.
function formatRecommendationMessage(recommendations) {
  if (!recommendations.length) {
    return null;
  }

  const names = recommendations.map((item) => item.name).join(" or ");
  return `You might also like: ${names}. Totally optional, just let me know!`;
}

module.exports = { getRecommendations, formatRecommendationMessage };

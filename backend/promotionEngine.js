// Checks an order against data/promotions.json's eligibility rules and
// picks the single best currently-eligible active promotion. Never
// invents a discount: only real, active promotions whose eligibility is
// actually met by the order are ever applied or recommended. Applying
// the result to the order's totals happens in pricing.js.

const { getActivePromotions } = require("./promotions");
const { findMenuItem } = require("./menu");

function toMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

function orderedCategories(order) {
  return new Set(
    order.items
      .map((item) => findMenuItem(item.id))
      .filter(Boolean)
      .map((menuItem) => menuItem.category)
  );
}

function isEligible(promotion, order, now) {
  const eligibility = promotion.eligibility || {};
  const categories = orderedCategories(order);

  // A promotion whose discount only applies to one category (e.g. 20% off
  // coffee) is never eligible for an order that has nothing in that
  // category, even if the promotion's own eligibility data doesn't spell
  // that out via requiredCategories.
  if (promotion.discount && promotion.discount.appliesTo && !categories.has(promotion.discount.appliesTo)) {
    return false;
  }

  if (eligibility.requiredCategories) {
    if (!eligibility.requiredCategories.every((category) => categories.has(category))) {
      return false;
    }
  }

  if (eligibility.minItems) {
    const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalQuantity < eligibility.minItems) {
      return false;
    }
  }

  if (eligibility.timeWindow) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = toMinutes(eligibility.timeWindow.start);
    const endMinutes = toMinutes(eligibility.timeWindow.end);
    if (nowMinutes < startMinutes || nowMinutes > endMinutes) {
      return false;
    }
  }

  return true;
}

function computeDiscountAmount(promotion, order) {
  const { discount } = promotion;
  if (!discount) return 0;

  const matchingItems = order.items.filter((item) => {
    const menuItem = findMenuItem(item.id);
    return menuItem && menuItem.category === discount.appliesTo;
  });

  if (discount.type === "percent") {
    const matchingTotal = matchingItems.reduce((sum, item) => sum + item.lineTotal, 0);
    return Number(((matchingTotal * discount.value) / 100).toFixed(2));
  }

  if (discount.type === "fixed") {
    return matchingItems.length > 0 ? discount.value : 0;
  }

  return 0;
}

// Every active promotion whose eligibility rules are currently met by
// the order.
function getEligiblePromotions(order, now = new Date()) {
  return getActivePromotions().filter((promotion) => isEligible(promotion, order, now));
}

// Picks whichever currently-eligible active promotion gives the largest
// discount for this order (or none). Pure — does not touch the order;
// callers decide how to apply the result to the order's totals.
function pickBestPromotion(order, now = new Date()) {
  const eligible = getEligiblePromotions(order, now);

  let bestPromotion = null;
  let bestDiscount = 0;

  for (const promotion of eligible) {
    const discountAmount = computeDiscountAmount(promotion, order);
    if (discountAmount > bestDiscount) {
      bestDiscount = discountAmount;
      bestPromotion = promotion;
    }
  }

  return { promotion: bestPromotion, discountAmount: bestDiscount };
}

// A short, factual message about the currently applied promotion, or
// null if none applies right now.
function formatPromotionMessage(order) {
  if (!order.promotion) return null;
  return `The "${order.promotion.name}" promotion has been applied, saving you $${order.promotion.discountAmount.toFixed(2)}.`;
}

module.exports = { getEligiblePromotions, pickBestPromotion, formatPromotionMessage };

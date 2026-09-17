// Deterministic order-total calculation. This is the ONLY place order
// totals are computed. Every input is plain arithmetic over real data:
// item prices come from data/menu.json (already resolved onto each line
// item as unitPrice/lineTotal when it was added), discounts come from
// data/promotions.json via promotionEngine, and tax/delivery fee come
// from the fixed values in pricingConfig.js. The language model never
// calculates or invents any of these numbers — it only ever reads back
// what this module computed.

const { pickBestPromotion } = require("./promotionEngine");
const { TAX_RATE, DELIVERY_FEE } = require("./pricingConfig");

function round2(amount) {
  return Number(amount.toFixed(2));
}

// Recomputes every derived money field on the order (subtotal, applied
// promotion, tax, delivery fee, total) from its items and orderType.
// Mutates and returns the order. Call this after any change to items,
// orderType, or anything else that could affect pricing.
function recalculateOrderTotals(order) {
  const subtotal = round2(order.items.reduce((sum, item) => sum + item.lineTotal, 0));

  const { promotion, discountAmount } = pickBestPromotion(order);
  order.promotion = promotion ? { id: promotion.id, name: promotion.name, discountAmount: round2(discountAmount) } : null;

  const discountedSubtotal = round2(subtotal - (order.promotion ? order.promotion.discountAmount : 0));
  const tax = round2(discountedSubtotal * TAX_RATE);
  const deliveryFee = order.orderType === "delivery" ? round2(DELIVERY_FEE) : 0;

  order.subtotal = subtotal;
  order.tax = tax;
  order.deliveryFee = deliveryFee;
  order.total = round2(discountedSubtotal + tax + deliveryFee);

  return order;
}

module.exports = { recalculateOrderTotals };

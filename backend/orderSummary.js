// Builds the complete structured order summary CafeBot must show the
// customer before checkout: items with quantities/customizations,
// fulfillment details, currently valid promotions, and the total. Pulled
// straight from order state and pricing/promotion data — nothing here
// is invented.

const { getEligiblePromotions } = require("./promotionEngine");

// Plain-language reasons checkout can't happen yet (empty array means
// the order is ready). Never guesses missing info — just reports it.
function getCheckoutBlockers(order) {
  const blockers = [];

  if (!order.items.length) {
    blockers.push("No items in the order yet.");
  }

  if (!order.orderType) {
    blockers.push("Order type (pickup or delivery) has not been selected yet.");
  } else if (order.orderType === "pickup") {
    if (!order.customerDetails.name) {
      blockers.push("Customer name is required for pickup.");
    }
  } else if (order.orderType === "delivery") {
    if (!order.customerDetails.name) blockers.push("Customer name is required for delivery.");
    if (!order.customerDetails.phone) blockers.push("Phone number is required for delivery.");
    if (!order.deliveryAddress) blockers.push("Delivery address is required.");
    if (order.deliveryAddress && !order.addressConfirmed) {
      blockers.push("Delivery address has not been confirmed yet.");
    }
  }

  return blockers;
}

function buildFulfillment(order) {
  const fulfillment = { type: order.orderType };

  if (order.orderType === "pickup") {
    fulfillment.customerName = order.customerDetails.name;
    fulfillment.pickupTime = order.pickupTime;
  } else if (order.orderType === "delivery") {
    fulfillment.customerName = order.customerDetails.name;
    fulfillment.phone = order.customerDetails.phone;
    fulfillment.address = order.deliveryAddress;
    fulfillment.addressConfirmed = order.addressConfirmed;
    fulfillment.apartmentUnit = order.apartmentUnit;
    fulfillment.deliveryInstructions = order.deliveryInstructions;
  }

  return fulfillment;
}

// The complete structured summary to show before checkout.
function buildOrderSummary(order) {
  const items = order.items.map((item) => ({
    id: item.id,
    name: item.name,
    size: item.size,
    quantity: item.quantity,
    options: item.options,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  }));

  const eligiblePromotions = getEligiblePromotions(order).map((promotion) => ({
    id: promotion.id,
    name: promotion.name,
    rule: promotion.rule,
  }));

  const blockers = getCheckoutBlockers(order);

  return {
    items,
    fulfillment: buildFulfillment(order),
    promotions: {
      applied: order.promotion,
      valid: eligiblePromotions,
    },
    pricing: {
      subtotal: order.subtotal,
      tax: order.tax,
      deliveryFee: order.deliveryFee,
      total: order.total,
    },
    readyForCheckout: blockers.length === 0,
    blockers,
  };
}

module.exports = { buildOrderSummary, getCheckoutBlockers };

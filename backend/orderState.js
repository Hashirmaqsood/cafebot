// Simple in-memory, session-based order state. No database — state is lost
// when the server restarts, which is fine for development.
//
// Order shape:
// {
//   items: [{ id, name, quantity, options: [], size, unitPrice }],
//   orderType: null | "dine-in" | "takeaway" | "pickup" | "delivery",
//   customerDetails: { name: null|string, phone: null|string },
//   pickupTime: null|string,
//   deliveryAddress: null|string,
//   addressConfirmed: boolean,
//   apartmentUnit: null|string,
//   deliveryInstructions: null|string,
//   promotion: null | { id, name, discountAmount },
//   subtotal: number,
//   tax: number,
//   deliveryFee: number,
//   total: number,
//   confirmed: boolean,
//   status: "building" | "confirmed" | "cancelled",
//   orderId: null|string,      // set only once actually confirmed & saved
//   confirmedAt: null|string,  // ISO timestamp of that confirmation
// }
//
// subtotal/tax/deliveryFee/total are always computed deterministically
// by recalculateOrderTotals() (see pricing.js) from item prices already
// resolved from data/menu.json, never estimated or invented. orderId
// and confirmedAt are set only by the confirmation gate (confirmation.js)
// when saving to data/orders.json — never by a draft.

const crypto = require("crypto");
const { findMenuItem } = require("./menu");
const { recalculateOrderTotals } = require("./pricing");

const sessions = new Map(); // sessionId -> order state

function createOrder() {
  return {
    items: [],
    orderType: null,
    customerDetails: { name: null, phone: null },
    pickupTime: null,
    deliveryAddress: null,
    addressConfirmed: false,
    apartmentUnit: null,
    deliveryInstructions: null,
    promotion: null,
    subtotal: 0,
    tax: 0,
    deliveryFee: 0,
    total: 0,
    confirmed: false,
    status: "building",
    orderId: null,
    confirmedAt: null,
  };
}

// A previously confirmed order must be reconfirmed if anything about it
// changes — the customer's earlier "yes" was for a different summary.
// The old orderId/confirmedAt no longer describe the current order; a
// fresh confirmation saves a new record rather than reusing them.
function invalidateConfirmation(order) {
  if (order.confirmed) {
    order.confirmed = false;
    order.status = "building";
    order.orderId = null;
    order.confirmedAt = null;
  }
}

function getOrCreateSession(sessionId) {
  if (sessionId && sessions.has(sessionId)) {
    return { sessionId, order: sessions.get(sessionId) };
  }

  const resolvedSessionId = sessionId || crypto.randomUUID();
  const order = createOrder();
  sessions.set(resolvedSessionId, order);
  return { sessionId: resolvedSessionId, order };
}

// Adds one menu item (with quantity, size, and options) to an order.
// Returns one of:
//   { error: string }              - invalid input, order unchanged
//   { needsInput: "size", message } - a required size wasn't given, order unchanged
//   { order }                       - success, order updated
function addItemToOrder(order, { itemId, size, options, quantity } = {}) {
  const menuItem = findMenuItem(itemId);
  if (!menuItem) {
    return { error: `Item '${itemId}' was not found in the menu.` };
  }

  const qty = quantity === undefined ? 1 : quantity;
  if (!Number.isInteger(qty) || qty < 1) {
    return { error: "'quantity' must be a positive whole number." };
  }

  let unitPrice;
  let resolvedSize = null;

  if (menuItem.sizes && menuItem.sizes.length > 0) {
    const sizeNames = menuItem.sizes.map((s) => s.name).join(", ");

    if (!size) {
      return {
        needsInput: "size",
        message: `What size would you like for ${menuItem.name}? Choose from: ${sizeNames}.`,
      };
    }

    const matchedSize = menuItem.sizes.find(
      (s) => s.name.toLowerCase() === String(size).toLowerCase()
    );
    if (!matchedSize) {
      return { error: `'${size}' is not a valid size for ${menuItem.name}. Choose from: ${sizeNames}.` };
    }

    resolvedSize = matchedSize.name;
    unitPrice = matchedSize.price;
  } else {
    if (typeof menuItem.price !== "number") {
      return { error: `${menuItem.name} does not have a price configured.` };
    }
    unitPrice = menuItem.price;
  }

  let resolvedOptions = [];
  if (options !== undefined) {
    if (!Array.isArray(options)) {
      return { error: "'options' must be an array of strings." };
    }
    const validOptions = menuItem.options || [];
    for (const opt of options) {
      if (!validOptions.includes(opt)) {
        return {
          error: `'${opt}' is not a valid option for ${menuItem.name}. Valid options: ${
            validOptions.join(", ") || "none"
          }.`,
        };
      }
    }
    resolvedOptions = options;
  }

  order.items.push({
    id: menuItem.id,
    name: menuItem.name,
    quantity: qty,
    size: resolvedSize,
    options: resolvedOptions,
    unitPrice,
    lineTotal: Number((unitPrice * qty).toFixed(2)),
  });

  invalidateConfirmation(order);
  recalculateOrderTotals(order);

  return { order };
}

// Updates quantity, size, and/or options on an existing order item,
// identified by its position in order.items. Only fields provided are
// changed; anything omitted keeps its current value. Returns one of:
//   { error: string } - invalid input or item not found, order unchanged
//   { order }          - success, order updated
function updateOrderItem(order, { itemIndex, quantity, size, options } = {}) {
  if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= order.items.length) {
    return { error: `Order item at index '${itemIndex}' was not found.` };
  }

  if (quantity === undefined && size === undefined && options === undefined) {
    return { error: "Provide at least one of 'quantity', 'size', or 'options' to update." };
  }

  const existingItem = order.items[itemIndex];
  const menuItem = findMenuItem(existingItem.id);
  if (!menuItem) {
    return { error: `${existingItem.name} is no longer available on the menu.` };
  }

  let nextQuantity = existingItem.quantity;
  if (quantity !== undefined) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { error: "'quantity' must be a positive whole number." };
    }
    nextQuantity = quantity;
  }

  let nextSize = existingItem.size;
  let unitPrice = existingItem.unitPrice;

  if (size !== undefined) {
    if (!menuItem.sizes || menuItem.sizes.length === 0) {
      return { error: `${menuItem.name} does not have size options.` };
    }

    const sizeNames = menuItem.sizes.map((s) => s.name).join(", ");
    const matchedSize = menuItem.sizes.find(
      (s) => s.name.toLowerCase() === String(size).toLowerCase()
    );
    if (!matchedSize) {
      return { error: `'${size}' is not a valid size for ${menuItem.name}. Choose from: ${sizeNames}.` };
    }

    nextSize = matchedSize.name;
    unitPrice = matchedSize.price;
  }

  let nextOptions = existingItem.options;
  if (options !== undefined) {
    if (!Array.isArray(options)) {
      return { error: "'options' must be an array of strings." };
    }
    const validOptions = menuItem.options || [];
    for (const opt of options) {
      if (!validOptions.includes(opt)) {
        return {
          error: `'${opt}' is not a valid option for ${menuItem.name}. Valid options: ${
            validOptions.join(", ") || "none"
          }.`,
        };
      }
    }
    nextOptions = options;
  }

  order.items[itemIndex] = {
    ...existingItem,
    quantity: nextQuantity,
    size: nextSize,
    options: nextOptions,
    unitPrice,
    lineTotal: Number((unitPrice * nextQuantity).toFixed(2)),
  };

  invalidateConfirmation(order);
  recalculateOrderTotals(order);

  return { order };
}

// Removes an item entirely from the order, identified by its position in
// order.items. Returns one of:
//   { error: string } - item not found, order unchanged
//   { order }          - success, order updated
function removeOrderItem(order, { itemIndex } = {}) {
  if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= order.items.length) {
    return { error: `Order item at index '${itemIndex}' was not found.` };
  }

  order.items.splice(itemIndex, 1);
  invalidateConfirmation(order);
  recalculateOrderTotals(order);

  return { order };
}

// Selects pickup for the order and collects the customer name (required)
// and pickup time (optional) needed before checkout. Only fields
// provided are changed; anything omitted keeps its current value.
// Returns one of:
//   { error: string }                    - invalid input, order unchanged
//   { needsInput: "customerName", message, order } - name still missing
//   { order }                             - success, order updated
function setPickupDetails(order, { customerName, pickupTime } = {}) {
  if (customerName !== undefined) {
    if (typeof customerName !== "string" || !customerName.trim()) {
      return { error: "'customerName' must be a non-empty string." };
    }
  }

  if (pickupTime !== undefined) {
    if (typeof pickupTime !== "string" || !pickupTime.trim()) {
      return { error: "'pickupTime' must be a non-empty string if provided." };
    }
  }

  order.orderType = "pickup";

  if (customerName !== undefined) {
    order.customerDetails.name = customerName.trim();
  }

  if (pickupTime !== undefined) {
    order.pickupTime = pickupTime.trim();
  }

  invalidateConfirmation(order);
  recalculateOrderTotals(order);

  if (!order.customerDetails.name) {
    return {
      needsInput: "customerName",
      message: "Can I get your name for the pickup order?",
      order,
    };
  }

  return { order };
}

const DELIVERY_FIELD_LABELS = {
  customerName: "your name",
  phone: "your phone number",
  address: "your full delivery address",
};

function listMissingFields(labels) {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

// Repeats the full delivery address (and apartment/unit, if any) back to
// the customer for explicit confirmation or correction before checkout.
function buildAddressConfirmationMessage(order) {
  const unitPart = order.apartmentUnit ? `, ${order.apartmentUnit}` : "";
  return `Just to confirm, I have your delivery address as: ${order.deliveryAddress}${unitPart}. Is that correct, or would you like to correct it?`;
}

// Selects delivery for the order and collects the required customer
// name, phone number, and full delivery address, plus the optional
// apartment/unit and delivery instructions. Only fields provided are
// changed; anything omitted keeps its current value. Nothing is ever
// guessed — required fields stay null, and CafeBot is told exactly
// what's still missing, until the customer actually supplies them.
// Returns one of:
//   { error: string }                                       - invalid input, order unchanged
//   { needsInput: "deliveryDetails", missingFields, message, order } - required info still missing
//   { order }                                                - success, order updated
function setDeliveryDetails(
  order,
  { customerName, phone, address, apartmentUnit, deliveryInstructions } = {}
) {
  if (customerName !== undefined) {
    if (typeof customerName !== "string" || !customerName.trim()) {
      return { error: "'customerName' must be a non-empty string." };
    }
  }

  if (phone !== undefined) {
    if (typeof phone !== "string" || !phone.trim()) {
      return { error: "'phone' must be a non-empty string." };
    }
  }

  if (address !== undefined) {
    if (typeof address !== "string" || !address.trim()) {
      return { error: "'address' must be a non-empty string." };
    }
  }

  if (apartmentUnit !== undefined && typeof apartmentUnit !== "string") {
    return { error: "'apartmentUnit' must be a string if provided." };
  }

  if (deliveryInstructions !== undefined && typeof deliveryInstructions !== "string") {
    return { error: "'deliveryInstructions' must be a string if provided." };
  }

  order.orderType = "delivery";

  if (customerName !== undefined) order.customerDetails.name = customerName.trim();
  if (phone !== undefined) order.customerDetails.phone = phone.trim();
  if (address !== undefined) {
    order.deliveryAddress = address.trim();
    order.addressConfirmed = false; // a new/changed address always needs fresh confirmation
  }
  if (apartmentUnit !== undefined) order.apartmentUnit = apartmentUnit.trim() || null;
  if (deliveryInstructions !== undefined) {
    order.deliveryInstructions = deliveryInstructions.trim() || null;
  }

  invalidateConfirmation(order);
  recalculateOrderTotals(order);

  const missingFields = [];
  if (!order.customerDetails.name) missingFields.push("customerName");
  if (!order.customerDetails.phone) missingFields.push("phone");
  if (!order.deliveryAddress) missingFields.push("address");

  if (missingFields.length) {
    const labels = missingFields.map((field) => DELIVERY_FIELD_LABELS[field]);
    return {
      needsInput: "deliveryDetails",
      missingFields,
      message: `Could you share ${listMissingFields(labels)} for delivery?`,
      order,
    };
  }

  if (!order.addressConfirmed) {
    return {
      needsInput: "addressConfirmation",
      message: buildAddressConfirmationMessage(order),
      order,
    };
  }

  return { order };
}

// Records the customer's explicit confirmation or correction of the
// delivery address before checkout. A correction updates the address
// and requires confirming it again — it is never assumed correct.
// Returns one of:
//   { error: string }                                    - invalid input, or no address to confirm yet
//   { needsInput: "addressConfirmation", message, order } - still needs a yes/no or a correction
//   { order }                                              - confirmed, order updated
function confirmDeliveryAddress(order, { confirmed, correctedAddress } = {}) {
  if (!order.deliveryAddress) {
    return { error: "There's no delivery address on file yet to confirm." };
  }

  if (correctedAddress !== undefined) {
    if (typeof correctedAddress !== "string" || !correctedAddress.trim()) {
      return { error: "'correctedAddress' must be a non-empty string." };
    }
    order.deliveryAddress = correctedAddress.trim();
    order.addressConfirmed = false;
    invalidateConfirmation(order);
    return {
      needsInput: "addressConfirmation",
      message: buildAddressConfirmationMessage(order),
      order,
    };
  }

  if (confirmed === true) {
    order.addressConfirmed = true;
    return { order };
  }

  if (confirmed === false) {
    return {
      needsInput: "addressConfirmation",
      message: "No problem — what's the correct delivery address?",
      order,
    };
  }

  return { error: "Provide 'confirmed' (true/false) or a 'correctedAddress'." };
}

// Builds a short, human-readable summary of an order's items (with
// quantities and customizations) and total, for CafeBot to read back to
// the customer.
function summarizeOrder(order) {
  let summary;

  if (!order.items.length) {
    summary = "Your order is currently empty.";
  } else {
    const lines = order.items.map((item) => {
      const sizePrefix = item.size ? `${item.size} ` : "";
      const customizations = item.options.length ? ` (${item.options.join(", ")})` : "";
      return `- ${item.quantity}x ${sizePrefix}${item.name}${customizations} — $${item.lineTotal.toFixed(2)}`;
    });

    summary = `Here's your current order:\n${lines.join("\n")}`;
    summary += `\nSubtotal: $${order.subtotal.toFixed(2)}`;

    if (order.promotion) {
      summary += `\n${order.promotion.name} applied: -$${order.promotion.discountAmount.toFixed(2)}`;
    }

    summary += `\nTax: $${order.tax.toFixed(2)}`;

    if (order.orderType === "delivery" && order.deliveryFee > 0) {
      summary += `\nDelivery fee: $${order.deliveryFee.toFixed(2)}`;
    }

    summary += `\nTotal: $${order.total.toFixed(2)}`;
  }

  if (order.orderType === "pickup") {
    summary += `\nPickup for: ${order.customerDetails.name || "(name needed)"}`;
    if (order.pickupTime) {
      summary += `\nPickup time: ${order.pickupTime}`;
    }
  }

  if (order.orderType === "delivery") {
    summary += `\nDeliver to: ${order.customerDetails.name || "(name needed)"}`;
    summary += `\nPhone: ${order.customerDetails.phone || "(phone needed)"}`;
    const addressStatus = order.deliveryAddress
      ? order.addressConfirmed
        ? " (confirmed)"
        : " (please confirm)"
      : "";
    summary += `\nAddress: ${order.deliveryAddress || "(address needed)"}${addressStatus}`;
    if (order.apartmentUnit) {
      summary += `\nApartment/unit: ${order.apartmentUnit}`;
    }
    if (order.deliveryInstructions) {
      summary += `\nDelivery instructions: ${order.deliveryInstructions}`;
    }
  }

  if (order.confirmed && order.orderId) {
    summary += `\nOrder confirmed! Order ID: ${order.orderId} (at ${order.confirmedAt})`;
  }

  return summary;
}

module.exports = {
  createOrder,
  getOrCreateSession,
  addItemToOrder,
  updateOrderItem,
  removeOrderItem,
  setPickupDetails,
  setDeliveryDetails,
  confirmDeliveryAddress,
  summarizeOrder,
};

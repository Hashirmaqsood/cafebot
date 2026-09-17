// Persists confirmed orders to data/orders.json — the simple flat-file
// storage set up for development (see data/README.md). No database.
//
// saveConfirmedOrder() is the ONLY way anything gets written here, and
// it refuses to write anything that isn't actually confirmed, so a
// draft/in-progress order can never end up saved as if it were placed.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { buildOrderSummary } = require("./orderSummary");

const ORDERS_PATH = path.join(__dirname, "..", "data", "orders.json");

function readOrders() {
  try {
    const raw = fs.readFileSync(ORDERS_PATH, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`Failed to read orders from ${ORDERS_PATH}: ${err.message}`);
    }
    return [];
  }
}

function writeOrders(orders) {
  fs.writeFileSync(ORDERS_PATH, `${JSON.stringify(orders, null, 2)}\n`, "utf8");
}

// The lifecycle a saved (already-confirmed) order can move through, for
// staff use on the dashboard.
const ORDER_STATUSES = ["confirmed", "preparing", "ready", "completed", "cancelled"];

// Appends one confirmed order as a structured record with a unique
// orderId, an ISO timestamp, and status "confirmed". Throws if the
// order hasn't actually been confirmed — callers (the confirmation
// gate) must confirm it first.
function saveConfirmedOrder(order, { sessionId } = {}) {
  if (!order.confirmed || order.status !== "confirmed") {
    throw new Error("Refusing to save an order that has not been explicitly confirmed.");
  }

  const record = {
    orderId: crypto.randomUUID(),
    sessionId: sessionId || null,
    timestamp: new Date().toISOString(),
    status: "confirmed",
    order: buildOrderSummary(order),
  };

  const orders = readOrders();
  orders.push(record);
  writeOrders(orders);

  return record;
}

// Returns every saved order record, newest first, for the staff
// dashboard.
function getAllOrders() {
  return readOrders().slice().reverse();
}

// Updates one saved order's status (e.g. "preparing", "ready",
// "completed", "cancelled"). Returns { error } or { record }.
function updateOrderStatus(orderId, status) {
  if (!ORDER_STATUSES.includes(status)) {
    return { error: `'status' must be one of: ${ORDER_STATUSES.join(", ")}.` };
  }

  const orders = readOrders();
  const index = orders.findIndex((record) => record.orderId === orderId);
  if (index === -1) {
    return { error: `Order '${orderId}' was not found.` };
  }

  orders[index] = { ...orders[index], status, updatedAt: new Date().toISOString() };
  writeOrders(orders);

  return { record: orders[index] };
}

module.exports = {
  saveConfirmedOrder,
  readOrders,
  getAllOrders,
  updateOrderStatus,
  ORDER_STATUSES,
};

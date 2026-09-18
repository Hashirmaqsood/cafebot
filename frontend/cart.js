// Real cart / checkout UI, wired to the actual backend order endpoints
// (/api/order/*). Shares `API_BASE` and `sessionId` with script.js
// (loaded before this file) — the cart and the chat widget operate on
// the same session/order, since both call the same backend session.
//
// This only works against the full backend (backend/server.js) — the
// Vercel serverless deployment (frontend/api/*.js) doesn't implement
// /api/order/* at all, since it can't hold state across requests.

const cartBtn = document.getElementById("cartBtn");
const cartBadge = document.getElementById("cartBadge");
const cartBackdrop = document.getElementById("cartBackdrop");
const cartModal = document.getElementById("cartModal");
const closeCartBtn = document.getElementById("closeCartBtn");
const cartBody = document.getElementById("cartBody");

let currentOrder = { items: [], orderType: null, customerDetails: {}, subtotal: 0, tax: 0, deliveryFee: 0, total: 0, promotion: null, confirmed: false };
let cartStep = "cart"; // cart | fulfillmentChoice | pickupForm | deliveryForm | addressConfirm | review | success
let cartError = "";
let lastSavedOrderId = null;

function money(n) {
  return `$${Number(n).toFixed(2)}`;
}

function updateBadge() {
  const count = currentOrder.items.reduce((sum, i) => sum + i.quantity, 0);
  cartBadge.hidden = count === 0;
  cartBadge.textContent = count;
}

async function apiCall(path, method, extraBody) {
  const payload = { ...extraBody };
  if (sessionId) payload.sessionId = sessionId;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { ok: false, data: { error: "Couldn't reach the server. Please try again in a moment." } };
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    // Not JSON — e.g. this deployment doesn't implement this endpoint
    // at all (the Vercel serverless build has no /api/order/*).
    return {
      ok: false,
      data: { error: "🛠️ Online ordering isn't set up on this preview yet — tap 💬 Chat now and CafeBot can help with your order in the meantime!" },
    };
  }

  if (data.sessionId) sessionId = data.sessionId;
  if (data.order) currentOrder = data.order;
  updateBadge();
  return { ok: res.ok, data };
}

// Mirrors the backend's own checkout-readiness rules (see
// orderSummary.js's getCheckoutBlockers) so the UI can decide which
// step to show without a extra round trip.
function nextStep() {
  const order = currentOrder;
  if (!order.items.length) return "cart";
  if (!order.orderType) return "fulfillmentChoice";
  if (order.orderType === "pickup") {
    return order.customerDetails.name ? "review" : "pickupForm";
  }
  if (order.orderType === "delivery") {
    const { name, phone } = order.customerDetails;
    if (!name || !phone || !order.deliveryAddress) return "deliveryForm";
    if (!order.addressConfirmed) return "addressConfirm";
    return "review";
  }
  return "cart";
}

function el(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function renderCartStep() {
  const order = currentOrder;
  const container = el(`<div></div>`);

  if (cartError) container.appendChild(el(`<p class="cart-error">${cartError}</p>`));

  if (!order.items.length) {
    container.appendChild(el(`<p class="cart-empty">Your cart is empty. Add something tasty from the menu!</p>`));
    cartBody.replaceChildren(container);
    return;
  }

  const list = el(`<div class="cart-items"></div>`);
  order.items.forEach((item, index) => {
    const row = el(`
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.size ? `${item.size} ` : ""}${item.name}</div>
          <div class="cart-item-price">${money(item.lineTotal)}</div>
        </div>
        <div class="cart-item-qty">
          <button type="button" class="qty-btn" data-action="dec" data-index="${index}">−</button>
          <span>${item.quantity}</span>
          <button type="button" class="qty-btn" data-action="inc" data-index="${index}">+</button>
          <button type="button" class="cart-remove" data-action="remove" data-index="${index}" aria-label="Remove">🗑</button>
        </div>
      </div>
    `);
    list.appendChild(row);
  });
  container.appendChild(list);

  const summary = el(`
    <div class="cart-summary">
      ${order.promotion ? `<div class="summary-row promo">${order.promotion.name} <span>-${money(order.promotion.discountAmount)}</span></div>` : ""}
      <div class="summary-row"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
      <div class="summary-row"><span>Tax</span><span>${money(order.tax)}</span></div>
      ${order.orderType === "delivery" ? `<div class="summary-row"><span>Delivery fee</span><span>${money(order.deliveryFee)}</span></div>` : ""}
      <div class="summary-row total"><span>Total</span><span>${money(order.total)}</span></div>
    </div>
  `);
  container.appendChild(summary);

  container.appendChild(
    el(`<button type="button" class="cart-primary-btn" data-action="checkout">Checkout</button>`)
  );

  cartBody.replaceChildren(container);
}

function renderFulfillmentChoice() {
  const container = el(`
    <div class="cart-step">
      <p class="step-label">How would you like your order?</p>
      <div class="fulfillment-choices">
        <button type="button" class="fulfillment-choice" data-action="choose-pickup">🏃 Pickup</button>
        <button type="button" class="fulfillment-choice" data-action="choose-delivery">🚚 Delivery</button>
      </div>
      <button type="button" class="cart-back-btn" data-action="back-to-cart">← Back to cart</button>
    </div>
  `);
  cartBody.replaceChildren(container);
}

function renderPickupForm() {
  const container = el(`
    <form class="cart-step" id="pickupForm">
      <p class="step-label">Pickup details</p>
      ${cartError ? `<p class="cart-error">${cartError}</p>` : ""}
      <label>Your name<input type="text" name="customerName" required /></label>
      <label>Pickup time (optional)<input type="text" name="pickupTime" placeholder="e.g. 3:30 PM or ASAP" /></label>
      <button type="submit" class="cart-primary-btn">Continue</button>
      <button type="button" class="cart-back-btn" data-action="back-to-fulfillment">← Back</button>
    </form>
  `);
  cartBody.replaceChildren(container);
  container.querySelector("input").focus();
}

function renderDeliveryForm() {
  const container = el(`
    <form class="cart-step" id="deliveryForm">
      <p class="step-label">Delivery details</p>
      ${cartError ? `<p class="cart-error">${cartError}</p>` : ""}
      <label>Your name<input type="text" name="customerName" required /></label>
      <label>Phone number<input type="tel" name="phone" required /></label>
      <label>Full address<input type="text" name="address" required /></label>
      <label>Apartment/unit (optional)<input type="text" name="apartmentUnit" /></label>
      <label>Delivery instructions (optional)<input type="text" name="deliveryInstructions" /></label>
      <button type="submit" class="cart-primary-btn">Continue</button>
      <button type="button" class="cart-back-btn" data-action="back-to-fulfillment">← Back</button>
    </form>
  `);
  cartBody.replaceChildren(container);
  container.querySelector("input").focus();
}

function renderAddressConfirm() {
  const order = currentOrder;
  const container = el(`
    <div class="cart-step">
      <p class="step-label">Please confirm your delivery address</p>
      <div class="address-preview">
        ${order.deliveryAddress}${order.apartmentUnit ? `, ${order.apartmentUnit}` : ""}
      </div>
      <button type="button" class="cart-primary-btn" data-action="confirm-address">Yes, that's correct</button>
      <button type="button" class="cart-back-btn" data-action="edit-address">Edit address</button>
    </div>
  `);
  cartBody.replaceChildren(container);
}

function renderReview() {
  const order = currentOrder;
  const itemsHtml = order.items
    .map((item) => `<div class="summary-row"><span>${item.quantity}x ${item.size ? `${item.size} ` : ""}${item.name}</span><span>${money(item.lineTotal)}</span></div>`)
    .join("");

  const fulfillmentHtml =
    order.orderType === "pickup"
      ? `<p>Pickup for <strong>${order.customerDetails.name}</strong>${order.pickupTime ? ` at ${order.pickupTime}` : ""}</p>`
      : `<p>Deliver to <strong>${order.customerDetails.name}</strong><br>${order.deliveryAddress}${order.apartmentUnit ? `, ${order.apartmentUnit}` : ""}<br>${order.customerDetails.phone}</p>`;

  const container = el(`
    <div class="cart-step">
      <p class="step-label">Review your order</p>
      ${cartError ? `<p class="cart-error">${cartError}</p>` : ""}
      <div class="cart-summary">
        ${itemsHtml}
        ${order.promotion ? `<div class="summary-row promo">${order.promotion.name} <span>-${money(order.promotion.discountAmount)}</span></div>` : ""}
        <div class="summary-row"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
        <div class="summary-row"><span>Tax</span><span>${money(order.tax)}</span></div>
        ${order.orderType === "delivery" ? `<div class="summary-row"><span>Delivery fee</span><span>${money(order.deliveryFee)}</span></div>` : ""}
        <div class="summary-row total"><span>Total</span><span>${money(order.total)}</span></div>
      </div>
      <div class="fulfillment-review">${fulfillmentHtml}</div>
      <button type="button" class="cart-primary-btn" data-action="confirm-order">Confirm Order</button>
      <button type="button" class="cart-back-btn" data-action="back-to-cart">← Edit cart</button>
    </div>
  `);
  cartBody.replaceChildren(container);
}

function renderSuccess() {
  const nextSteps =
    currentOrder.orderType === "delivery"
      ? "We'll get it out for delivery — please have payment ready when it arrives."
      : "Please proceed to the counter to pay and pick up your order.";
  const container = el(`
    <div class="cart-step cart-success">
      <div class="success-icon">🎉</div>
      <p class="step-label">Order confirmed!</p>
      <p>Your order ID is <strong>#${lastSavedOrderId.slice(0, 8)}</strong>. ${nextSteps}</p>
      <button type="button" class="cart-primary-btn" data-action="close-cart">Done</button>
    </div>
  `);
  cartBody.replaceChildren(container);
}

function render() {
  if (cartStep === "success") return renderSuccess();
  if (cartStep === "review") return renderReview();
  if (cartStep === "addressConfirm") return renderAddressConfirm();
  if (cartStep === "deliveryForm") return renderDeliveryForm();
  if (cartStep === "pickupForm") return renderPickupForm();
  if (cartStep === "fulfillmentChoice") return renderFulfillmentChoice();
  return renderCartStep();
}

function goTo(step, error = "") {
  cartStep = step;
  cartError = error;
  render();
}

function openCart() {
  cartBackdrop.hidden = false;
  cartModal.hidden = false;
  // If this order was already confirmed this session, show the success
  // screen again rather than "review" (which would let a re-click of
  // "Confirm Order" save a second, duplicate record for nothing new).
  goTo(currentOrder.confirmed && lastSavedOrderId ? "success" : nextStep());
}

function closeCart() {
  cartBackdrop.hidden = true;
  cartModal.hidden = true;
}

cartBtn.addEventListener("click", openCart);
closeCartBtn.addEventListener("click", closeCart);
cartBackdrop.addEventListener("click", closeCart);

// Called from home.js when a customer clicks "Add to Cart" on a menu item.
async function addToCart(itemId, size) {
  const { ok, data } = await apiCall("/api/order/items", "POST", size ? { itemId, size } : { itemId });
  if (!ok || data.needsInput) {
    openCart();
    goTo("cart", data.error || data.message);
  } else {
    // Always surface the cart on a successful add — silently updating
    // just the header badge left customers unsure whether anything
    // happened at all.
    openCart();
    goTo("cart");
  }
}

cartBody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const index = button.dataset.index !== undefined ? Number(button.dataset.index) : null;

  if (action === "inc") {
    await apiCall("/api/order/items", "PATCH", { itemIndex: index, quantity: currentOrder.items[index].quantity + 1 });
    goTo("cart");
  } else if (action === "dec") {
    const item = currentOrder.items[index];
    if (item.quantity <= 1) {
      await apiCall("/api/order/items", "DELETE", { itemIndex: index });
    } else {
      await apiCall("/api/order/items", "PATCH", { itemIndex: index, quantity: item.quantity - 1 });
    }
    goTo("cart");
  } else if (action === "remove") {
    await apiCall("/api/order/items", "DELETE", { itemIndex: index });
    goTo("cart");
  } else if (action === "checkout") {
    goTo(nextStep());
  } else if (action === "back-to-cart") {
    goTo("cart");
  } else if (action === "back-to-fulfillment") {
    goTo("fulfillmentChoice");
  } else if (action === "choose-pickup") {
    await apiCall("/api/order/pickup", "POST", {});
    goTo("pickupForm");
  } else if (action === "choose-delivery") {
    await apiCall("/api/order/delivery", "POST", {});
    goTo("deliveryForm");
  } else if (action === "confirm-address") {
    await apiCall("/api/order/delivery/confirm-address", "POST", { confirmed: true });
    goTo(nextStep());
  } else if (action === "edit-address") {
    goTo("deliveryForm");
  } else if (action === "confirm-order") {
    const { ok, data } = await apiCall("/api/order/confirm", "POST", { reply: "yes" });
    if (ok && data.saved) {
      lastSavedOrderId = data.saved.orderId;
      goTo("success");
    } else {
      goTo("review", data.message || data.error || "Something went wrong confirming your order.");
    }
  } else if (action === "close-cart") {
    closeCart();
  }
});

cartBody.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const fields = Object.fromEntries(new FormData(form).entries());

  if (form.id === "pickupForm") {
    const { ok, data } = await apiCall("/api/order/pickup", "POST", {
      customerName: fields.customerName,
      pickupTime: fields.pickupTime || undefined,
    });
    if (!ok) {
      goTo("pickupForm", data.error);
    } else {
      goTo(nextStep());
    }
  } else if (form.id === "deliveryForm") {
    const { ok, data } = await apiCall("/api/order/delivery", "POST", {
      customerName: fields.customerName,
      phone: fields.phone,
      address: fields.address,
      apartmentUnit: fields.apartmentUnit || undefined,
      deliveryInstructions: fields.deliveryInstructions || undefined,
    });
    if (!ok) {
      goTo("deliveryForm", data.error);
    } else {
      goTo(nextStep());
    }
  }
});

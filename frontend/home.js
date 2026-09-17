// Homepage-only behavior: loads the menu/hours sections, filters the
// menu by category, and toggles the floating chat widget. Reuses the
// API_BASE constant and chat logic already declared in script.js
// (loaded before this file) — do not redeclare it here, that would
// throw a SyntaxError across script tags.

const menuGrid = document.getElementById("menuGrid");
const menuFilters = document.getElementById("menuFilters");
const hoursContent = document.getElementById("hoursContent");
const chatWidget = document.getElementById("chatWidget");
const chatFab = document.getElementById("chatFab");
const closeChatBtn = document.getElementById("closeChatBtn");
const openChatBtn = document.getElementById("openChatBtn");
const navChatBtn = document.getElementById("navChatBtn");

function openChat() {
  chatWidget.hidden = false;
  chatFab.hidden = true;
  document.getElementById("chatInput").focus();
}

function closeChat() {
  chatWidget.hidden = true;
  chatFab.hidden = false;
}

chatFab.addEventListener("click", openChat);
closeChatBtn.addEventListener("click", closeChat);
openChatBtn.addEventListener("click", openChat);
navChatBtn.addEventListener("click", openChat);

function formatPrice(item) {
  if (item.sizes && item.sizes.length) {
    return item.sizes.map((s) => `${s.name} $${s.price.toFixed(2)}`).join(" · ");
  }
  return `$${item.price.toFixed(2)}`;
}

function renderMenuItems(items) {
  menuGrid.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "menu-card";

    const category = document.createElement("div");
    category.className = "category";
    category.textContent = item.category;

    const name = document.createElement("h3");
    name.textContent = item.name;

    const description = document.createElement("p");
    description.textContent = item.description;

    const prices = document.createElement("div");
    prices.className = "prices";
    prices.textContent = formatPrice(item);

    const cartRow = document.createElement("div");
    cartRow.className = "menu-card-cart-row";

    let sizeSelect = null;
    if (item.sizes && item.sizes.length) {
      sizeSelect = document.createElement("select");
      sizeSelect.className = "size-select";
      item.sizes.forEach((size) => {
        const option = document.createElement("option");
        option.value = size.name;
        option.textContent = size.name;
        sizeSelect.appendChild(option);
      });
      cartRow.appendChild(sizeSelect);
    }

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "add-to-cart-btn";
    addButton.textContent = "Add to Cart";
    addButton.addEventListener("click", () => {
      addToCart(item.id, sizeSelect ? sizeSelect.value : undefined);
      addButton.textContent = "Added ✓";
      setTimeout(() => {
        addButton.textContent = "Add to Cart";
      }, 1200);
    });
    cartRow.appendChild(addButton);

    card.append(category, name, description, prices, cartRow);
    menuGrid.appendChild(card);
  });
}

function renderMenuFilters(items) {
  const categories = ["all", ...new Set(items.map((item) => item.category))];

  menuFilters.innerHTML = "";
  categories.forEach((category) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "filter-pill" + (category === "all" ? " active" : "");
    pill.textContent = category === "all" ? "All" : category.replace(/\b\w/g, (c) => c.toUpperCase());
    pill.dataset.category = category;

    pill.addEventListener("click", () => {
      menuFilters.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      renderMenuItems(category === "all" ? items : items.filter((item) => item.category === category));
    });

    menuFilters.appendChild(pill);
  });
}

async function loadMenu() {
  try {
    const res = await fetch(`${API_BASE}/api/menu`);
    const data = await res.json();
    renderMenuFilters(data.items);
    renderMenuItems(data.items);
  } catch (err) {
    menuGrid.textContent = "Couldn't load the menu right now — please try again shortly.";
  }
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

async function loadFaq() {
  try {
    const res = await fetch(`${API_BASE}/api/faq`);
    const data = await res.json();
    const today = DAY_NAMES[new Date().getDay()];

    const hoursGrid = document.createElement("div");
    hoursGrid.className = "hours-grid";
    DAY_NAMES.filter((day) => data.hours && data.hours[day]).forEach((day) => {
      const row = document.createElement("div");
      row.className = "day" + (day === today ? " today" : "");

      const label = document.createElement("span");
      label.textContent = day[0].toUpperCase() + day.slice(1);

      const value = document.createElement("span");
      value.textContent = data.hours[day];

      row.append(label, value);
      hoursGrid.appendChild(row);
    });

    const locationBlock = document.createElement("div");
    locationBlock.className = "location-block";

    function addRow(icon, text) {
      const row = document.createElement("div");
      row.className = "location-row";
      row.innerHTML = `<span class="icon">${icon}</span><span>${text}</span>`;
      locationBlock.appendChild(row);
    }

    if (data.location) {
      addRow("📍", data.location.address);
      addRow("📞", data.location.phone);
      if (data.location.parking) addRow("🅿️", data.location.parking);
    }
    if (data.wifi) addRow("📶", data.wifi);

    hoursContent.innerHTML = "";
    hoursContent.append(hoursGrid, locationBlock);
  } catch (err) {
    hoursContent.textContent = "Couldn't load hours right now — please try again shortly.";
  }
}

loadMenu();
loadFaq();

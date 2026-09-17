// Homepage-only behavior: loads the menu/hours sections and toggles the
// floating chat widget. Reuses the API_BASE constant and chat logic
// already declared in script.js (loaded before this file) — do not
// redeclare it here, that would throw a SyntaxError across script tags.

const menuGrid = document.getElementById("menuGrid");
const hoursContent = document.getElementById("hoursContent");
const chatWidget = document.getElementById("chatWidget");
const chatFab = document.getElementById("chatFab");
const closeChatBtn = document.getElementById("closeChatBtn");
const openChatBtn = document.getElementById("openChatBtn");

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

function formatPrice(item) {
  if (item.sizes && item.sizes.length) {
    return item.sizes.map((s) => `${s.name} $${s.price.toFixed(2)}`).join(" · ");
  }
  return `$${item.price.toFixed(2)}`;
}

async function loadMenu() {
  try {
    const res = await fetch(`${API_BASE}/api/menu`);
    const data = await res.json();
    menuGrid.innerHTML = "";
    data.items.forEach((item) => {
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

      card.append(category, name, description, prices);
      menuGrid.appendChild(card);
    });
  } catch (err) {
    menuGrid.textContent = "Couldn't load the menu right now — please try again shortly.";
  }
}

async function loadFaq() {
  try {
    const res = await fetch(`${API_BASE}/api/faq`);
    const data = await res.json();

    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const hoursGrid = document.createElement("div");
    hoursGrid.className = "hours-grid";
    days
      .filter((day) => data.hours && data.hours[day])
      .forEach((day) => {
        const row = document.createElement("div");
        row.className = "day";

        const label = document.createElement("span");
        label.textContent = day[0].toUpperCase() + day.slice(1);

        const value = document.createElement("span");
        value.textContent = data.hours[day];

        row.append(label, value);
        hoursGrid.appendChild(row);
      });

    const locationBlock = document.createElement("div");
    locationBlock.className = "location-block";
    if (data.location) {
      locationBlock.innerHTML = `<p>📍 ${data.location.address}</p><p>📞 ${data.location.phone}</p>`;
    }
    if (data.wifi) {
      locationBlock.innerHTML += `<p>📶 ${data.wifi}</p>`;
    }

    hoursContent.innerHTML = "";
    hoursContent.append(hoursGrid, locationBlock);
  } catch (err) {
    hoursContent.textContent = "Couldn't load hours right now — please try again shortly.";
  }
}

loadMenu();
loadFaq();

// CafeBot frontend — talks to the real /api/chat endpoint.
// If the backend isn't reachable, sending a message shows an error
// bubble rather than a fake reply.

// Locally, the frontend is opened separately from backend/server.js
// (different origin/port), so it needs that full URL. Deployed on
// Vercel, /api/chat is a serverless function bundled with this same
// site (see frontend/api/chat.js), so a relative path is correct and
// works regardless of the deployment's domain.
const API_BASE =
  location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "";

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatArea = document.getElementById("chatArea");

// Generated immediately (not left null) because the order endpoints
// used by cart.js require a sessionId upfront — only /api/chat can
// auto-generate one on its own. Chat and cart share this same id, so
// they operate on the same order.
let sessionId = crypto.randomUUID();
const history = [];

function addMessage(text, sender) {
  const messageEl = document.createElement("div");
  messageEl.className = `message ${sender}`;

  const bubbleEl = document.createElement("div");
  bubbleEl.className = "bubble";
  bubbleEl.textContent = text;

  messageEl.appendChild(bubbleEl);
  chatArea.appendChild(messageEl);
  chatArea.scrollTop = chatArea.scrollHeight;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = chatInput.value.trim();
  if (!text) return;

  addMessage(text, "customer");
  chatInput.value = "";
  chatInput.focus();

  try {
    const payload = { message: text, history };
    if (sessionId) payload.sessionId = sessionId;

    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      addMessage(data.error || "Something went wrong. Please try again.", "bot");
      return;
    }

    sessionId = data.sessionId;
    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: data.reply });
    addMessage(data.reply, "bot");
  } catch (err) {
    addMessage("Sorry, I can't reach the CafeBot server right now. Please try again in a moment.", "bot");
  }
});

// Some environments don't trigger native form submission on Enter reliably,
// so handle it explicitly as a fallback.
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

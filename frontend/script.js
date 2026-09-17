// CafeBot frontend — UI only. No AI API, database, or auth is connected here.
// Sending a message just displays it and echoes a mock bot reply for demo purposes.

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatArea = document.getElementById("chatArea");

const MOCK_REPLIES = [
  "Thanks for your message! (This is a demo — no AI is connected yet.)",
  "Got it! Once the backend is built, I'll be able to give a real answer here.",
  "Noted! This chat is currently running on mock data only.",
];

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

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = chatInput.value.trim();
  if (!text) return;

  addMessage(text, "customer");
  chatInput.value = "";
  chatInput.focus();

  const reply = MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)];
  setTimeout(() => addMessage(reply, "bot"), 400);
});

// Some environments don't trigger native form submission on Enter reliably,
// so handle it explicitly as a fallback.
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

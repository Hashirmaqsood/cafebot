# Frontend

- `home.html` / `home.css` / `home.js` — the cafe's homepage: hero section, a menu grid (`GET /api/menu`) and hours/location (`GET /api/faq`) loaded live, and CafeBot as a floating chat widget. This is the main entry point — open it while `backend/server.js` is running.
- `index.html` / `styles.css` / `script.js` — a standalone full-page chat UI, kept as a scripted demo (`index.html`'s messages are hardcoded) for a quick visual reference. `script.js` also powers `home.html`'s real chat widget (via `POST /api/chat`) — its `API_BASE` constant near the top controls both.
- `staff.html` — a minimal staff dashboard. Fetches saved orders from `GET /api/staff/orders` and lets staff update an order's status via `PATCH /api/staff/orders/:orderId`. Self-contained (inline CSS/JS, no build step); open it directly in a browser while `backend/server.js` is running. Edit the `API_BASE` constant near the top of its `<script>` if the backend isn't on `http://localhost:3000`.

**Note:** `home.js` relies on `script.js`'s `API_BASE` constant already being declared (it's loaded first in `home.html`) — don't add a second `const API_BASE` there, redeclaring a `const` across `<script>` tags throws a `SyntaxError` that silently breaks the whole page.

# Frontend

- `index.html` / `styles.css` / `script.js` — the customer-facing chat interface (mock messages only; not yet connected to the backend).
- `staff.html` — a minimal staff dashboard. Fetches saved orders from `GET /api/staff/orders` and lets staff update an order's status via `PATCH /api/staff/orders/:orderId`. Self-contained (inline CSS/JS, no build step); open it directly in a browser while `backend/server.js` is running. Edit the `API_BASE` constant near the top of its `<script>` if the backend isn't on `http://localhost:3000`.

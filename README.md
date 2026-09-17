# CafeBot

A chatbot backend for a cafe: browse the menu, build an order (with size/customizations), apply promotions, choose pickup or delivery, and confirm before checkout — all with deterministic, code-driven logic (menu prices, tax, discounts, and the confirmation gate are never left to a language model to calculate or guess). Includes a mock customer chat UI and a minimal staff dashboard for managing confirmed orders.

## Goals

- Keep things beginner-friendly and easy to follow.
- Keep costs low (small/free-tier models, no paid infrastructure required to start).

## Current status

- **Backend** (`backend/`): a dependency-free Node.js API — menu/order management, promotions, pickup/delivery collection with address confirmation, deterministic pricing, and an explicit confirmation gate that saves confirmed orders to `data/orders.json`. See `backend/README.md` for the full endpoint list.
- **Frontend** (`frontend/index.html`): a chat UI with mock messages — **not yet wired up to the backend or an AI model.**
- **Staff dashboard** (`frontend/staff.html`): lists saved orders and lets staff update their status. No authentication — local/trusted use only.
- **Not yet implemented:** the actual AI/LLM call (CafeBot's replies are a placeholder today) and real checkout/payment processing.

## Folder structure

```
cafebot/
├── prompts/          # CafeBot's system prompt (for the future AI integration)
├── data/             # menu.json, promotions.json (content) and orders.json (runtime data, gitignored)
├── frontend/         # customer chat UI (mock) + staff dashboard, static HTML/CSS/JS, no build step
├── backend/          # Node.js API — see backend/README.md
├── .env.example      # template listing every environment variable the project uses or will use
└── README.md         # this file
```

## Prerequisites

- Node.js 18 or later (see `backend/package.json`'s `engines` field) — needed to run the backend. No `npm install` is required; the backend has zero dependencies.
- A modern browser — needed to open the frontend and staff dashboard. No build tooling required.

## Running it locally

```bash
cd backend
npm start
```

This starts the API on `http://localhost:3000` (or your `PORT`, see below).

Then open `frontend/index.html` in a browser for the (currently mock) customer chat, and/or `frontend/staff.html` for the staff dashboard. Opening the HTML files directly (double-click, or `file://`) works fine — no server needed for the frontend itself.

## Environment variables

See `.env.example` for the full list. Copy it if you want a local reference:

```bash
cp .env.example .env
```

**Important:** the backend does not load `.env` files automatically (no `dotenv` dependency — kept dependency-free on purpose). `.env` is just a template/reference here. To actually set a variable, export it in your shell before running `npm start`, or set it in your hosting platform's environment variable settings.

Of the variables listed, only `PORT` has any effect today. `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_API_BASE_URL`, and `AI_MAX_TOKENS` are placeholders reserved for when the backend is actually connected to an AI model — they do nothing yet. **Never commit a real `.env` file or real API keys** — `.gitignore` already excludes `.env` (and `.env.*`, keeping `.env.example` itself trackable).

## Deploying

- **Backend:** deploy the `backend/` folder as a Node.js web service. Start command: `npm start`. Most hosting platforms provide `PORT` automatically; the app falls back to `3000` if it's unset.
- **Data persistence:** `data/orders.json` is plain-file storage, not a database, and is recreated automatically if missing. Most hosting platforms have an ephemeral filesystem, so its contents can be lost on redeploy/restart unless your host gives you a persistent disk. It also holds customer PII (name, phone, address), so it's gitignored — never commit it.
- **Frontend:** `frontend/*.html` are static files — host them on any static file host (or open locally). `frontend/staff.html` has a hardcoded `API_BASE` constant near the top of its `<script>` pointing at `http://localhost:3000`; update it to your deployed backend's URL. `frontend/index.html`'s chat is still mock-only and isn't wired to the backend yet, so there's nothing to point there.
- **Staff dashboard access:** it has no authentication. Don't publish it on a public URL without adding your own access control.
- **CORS:** the backend already sends permissive `Access-Control-Allow-Origin: *` headers, so a frontend hosted on a different domain/port can call it without extra configuration.

## Status

🚧 Ordering backend, mock chat UI, and staff dashboard are built. The actual AI integration (calling a real language model) and real checkout/payment are not implemented yet.

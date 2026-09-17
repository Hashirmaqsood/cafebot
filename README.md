# CafeBot

A chatbot backend for a cafe: browse the menu, build an order (with size/customizations), apply promotions, choose pickup or delivery, and confirm before checkout — all with deterministic, code-driven logic (menu prices, tax, discounts, and the confirmation gate are never left to a language model to calculate or guess). Includes a mock customer chat UI and a minimal staff dashboard for managing confirmed orders.

## Goals

- Keep things beginner-friendly and easy to follow.
- Keep costs low (small/free-tier models, no paid infrastructure required to start).

## Current status

- **Backend** (`backend/`): a dependency-free Node.js API — menu/order management, promotions, pickup/delivery collection with address confirmation, deterministic pricing, an explicit confirmation gate that saves confirmed orders to `data/orders.json`, and a `/api/chat` endpoint that calls Anthropic's API (grounded with the real menu/promotions/order data) for CafeBot's replies. See `backend/README.md` for the full endpoint list.
- **Frontend** (`frontend/index.html`): a chat UI with **scripted demo messages** — not yet wired up to the real `/api/chat` endpoint.
- **Staff dashboard** (`frontend/staff.html`): lists saved orders and lets staff update their status. No authentication — local/trusted use only.
- **Not yet implemented:** wiring the frontend chat UI to the real backend (it currently talks to `/api/order/*` only through direct API calls, not through the chat box), and real checkout/payment processing.

## Folder structure

```
cafebot/
├── prompts/          # CafeBot's system prompt (used to ground its AI replies)
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

**Note:** no `dotenv` dependency (kept dependency-free on purpose) — the backend reads `.env` itself on startup, without overriding any variable your shell or hosting platform already set. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` to enable real AI replies; `AI_MODEL`, `AI_API_BASE_URL`, and `AI_MAX_TOKENS` are optional and have sensible defaults if left blank. **Never commit a real `.env` file or real API keys** — `.gitignore` already excludes `.env` (and `.env.*`, keeping `.env.example` itself trackable).

## Deploying

- **Backend:** deploy the `backend/` folder as a Node.js web service. Start command: `npm start`. Most hosting platforms provide `PORT` automatically; the app falls back to `3000` if it's unset.
- **Data persistence:** `data/orders.json` is plain-file storage, not a database, and is recreated automatically if missing. Most hosting platforms have an ephemeral filesystem, so its contents can be lost on redeploy/restart unless your host gives you a persistent disk. It also holds customer PII (name, phone, address), so it's gitignored — never commit it.
- **Frontend:** `frontend/*.html` are static files — host them on any static file host (or open locally). `frontend/staff.html` has a hardcoded `API_BASE` constant near the top of its `<script>` pointing at `http://localhost:3000`; update it to your deployed backend's URL. `frontend/index.html`'s chat is still mock-only and isn't wired to the backend yet, so there's nothing to point there.
- **Staff dashboard access:** it has no authentication. Don't publish it on a public URL without adding your own access control.
- **CORS:** the backend already sends permissive `Access-Control-Allow-Origin: *` headers, so a frontend hosted on a different domain/port can call it without extra configuration.

## Status

🚧 Ordering backend (now with real AI replies via Anthropic's API), mock chat UI, and staff dashboard are built. Wiring the chat UI to the real backend, and real checkout/payment, are not implemented yet.

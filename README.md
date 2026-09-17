# CafeBot

A chatbot backend for a cafe: browse the menu, build an order (with size/customizations), apply promotions, choose pickup or delivery, and confirm before checkout — all with deterministic, code-driven logic (menu prices, tax, discounts, and the confirmation gate are never left to a language model to calculate or guess). Includes a mock customer chat UI and a minimal staff dashboard for managing confirmed orders.

## Goals

- Keep things beginner-friendly and easy to follow.
- Keep costs low (small/free-tier models, no paid infrastructure required to start).

## Current status

- **Backend** (`backend/`): a dependency-free Node.js API — menu/order management, promotions, pickup/delivery collection with address confirmation, deterministic pricing, an explicit confirmation gate that saves confirmed orders to `data/orders.json`, and a `/api/chat` endpoint that calls Anthropic's API (grounded with the real menu/promotions/FAQ/order data) for CafeBot's replies. See `backend/README.md` for the full endpoint list.
- **Serverless functions** (`frontend/api/`): a second, stateless implementation of `/api/menu`, `/api/faq`, and `/api/chat` as Vercel serverless functions, so the homepage works when deployed to a static host like Vercel (which can't run `backend/`'s persistent server). They reuse the same `backend/menu.js`/`promotions.js`/`faq.js`/`aiReply.js` modules — one source of truth for the data and the AI call — but **can't hold order/session state across requests**, so `/api/order/*` and `/api/staff/*` are only on the real backend. See "Deploying" below.
- **Homepage** (`frontend/index.html`): the cafe's website (and default page, so static hosts like Vercel serve it at "/") — hero section, a menu grid and hours/location loaded live from `/api/menu` and `/api/faq`, and CafeBot as a floating chat widget wired to the real `/api/chat` endpoint. `frontend/script.js` auto-detects whether to call the local backend (`localhost:3000`) or same-origin serverless functions, based on the page's own hostname.
- **Standalone chat page** (`frontend/demo.html`): a full-page chat UI with **scripted demo messages only** — kept as-is for a quick visual demo; not wired to the backend.
- **Staff dashboard** (`frontend/staff.html`): lists saved orders and lets staff update their status. No authentication — local/trusted use only.
- **Not yet implemented:** real checkout/payment processing.

## Folder structure

```
cafebot/
├── prompts/          # CafeBot's system prompt (used to ground its AI replies)
├── data/             # menu.json, promotions.json, faq.json (content) and orders.json (runtime data, gitignored)
├── frontend/         # index.html = real homepage (chat widget), demo.html = standalone mock chat page, staff.html = dashboard
│   └── api/          # stateless Vercel serverless versions of /api/menu, /api/faq, /api/chat
├── backend/          # full Node.js API (persistent server, all endpoints) — see backend/README.md
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

Then open `frontend/index.html` in a browser for the cafe homepage with the real, working chat widget, and/or `frontend/staff.html` for the staff dashboard. `frontend/demo.html` is a separate standalone page kept as a scripted demo only. Opening the HTML files directly (double-click, or `file://`) works fine — no server needed for the frontend itself.

## Environment variables

See `.env.example` for the full list. Copy it if you want a local reference:

```bash
cp .env.example .env
```

**Note:** no `dotenv` dependency (kept dependency-free on purpose) — the backend reads `.env` itself on startup, without overriding any variable your shell or hosting platform already set. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` to enable real AI replies; `AI_MODEL`, `AI_API_BASE_URL`, and `AI_MAX_TOKENS` are optional and have sensible defaults if left blank. **Never commit a real `.env` file or real API keys** — `.gitignore` already excludes `.env` (and `.env.*`, keeping `.env.example` itself trackable).

## Deploying

Two ways to deploy this, with a real tradeoff between them:

**Option A — Vercel only (homepage + chat, no order-taking or staff dashboard)**

1. Import the repo into Vercel with **Root Directory set to `frontend`**.
2. Add environment variable `ANTHROPIC_API_KEY` (and optionally `AI_MODEL`, `AI_API_BASE_URL`, `AI_MAX_TOKENS`) in the Vercel project's Environment Variables settings.
3. Deploy. `frontend/api/*.js` run as serverless functions alongside the static site; `frontend/script.js` automatically calls them via a relative path (no `API_BASE` edit needed).
4. **Limitation:** serverless functions don't share memory across requests, so multi-step order-building (add item → set pickup → confirm) doesn't work through this deployment — only the chat, menu, and hours/location work. `frontend/staff.html` and `/api/order/*` are not available here at all (they only exist on `backend/server.js`).

**Option B — Full backend on a persistent host (everything works, including ordering + staff dashboard)**

1. Deploy the `backend/` folder as a Node.js web service (e.g. Render, Railway) with start command `npm start` and `ANTHROPIC_API_KEY` set. Most hosting platforms provide `PORT` automatically.
2. Update `API_BASE` in `frontend/script.js` and `frontend/staff.html` to that backend's URL, then host `frontend/*.html` anywhere static (including Vercel — the `frontend/api/` functions are simply unused in this setup).
3. `data/orders.json` is plain-file storage, not a database, and is recreated automatically if missing — but most hosting platforms have an ephemeral filesystem, so it can be lost on redeploy/restart unless your host gives you a persistent disk. It also holds customer PII (name, phone, address), so it's gitignored — never commit it.

**Either way:**
- `frontend/staff.html` has no authentication. Don't publish it on a public URL without adding your own access control.
- The backend already sends permissive `Access-Control-Allow-Origin: *` headers, so a frontend hosted on a different domain/port can call it without extra configuration.

## Status

🚧 Ordering backend (with real AI replies via Anthropic's API), a real cafe homepage with a working chat widget, a standalone mock chat page, a staff dashboard, and a stateless Vercel serverless deployment option are all built. Real checkout/payment is not implemented yet.

# CLAUDE.md

Guidance for Claude Code (and any other AI assistant) working in this repository.

## Project purpose

CafeBot is a simple chatbot for a cafe — answering menu questions, taking basic orders, and handling FAQs (hours, location, etc.). It is a **beginner-friendly, low-cost** project: prefer small/free-tier models, simple file-based data, and minimal infrastructure over anything heavyweight.

## Architecture (simple, by design)

```
prompts/   - system prompts and prompt templates (plain markdown/text)
data/      - reference data the bot reads from (menu.json, faq.json, etc. — no database)
frontend/  - the chat UI (a simple static page or small app)
backend/   - a small server/API that: reads a prompt from prompts/,
             reads data from data/, calls the LLM, returns the reply
.env       - local secrets (never committed); see .env.example for the template
```

Flow: `frontend` sends a user message → `backend` combines it with a prompt from `prompts/` and data from `data/` → `backend` calls the LLM API → reply goes back to `frontend`. No database, no queues, no microservices — keep it this simple unless there's a clear reason to grow it.

## Coding rules

- Keep code simple and readable over clever — this is a beginner-friendly project.
- Don't add frameworks, libraries, or abstractions the current task doesn't need.
- No premature scaling (databases, caching layers, microservices, job queues) — flat files in `data/` and a single small backend service are enough.
- Don't add features, config options, or error handling for scenarios that can't happen yet.
- Prefer editing an existing file over creating a new one.
- Write minimal comments — only when the *why* isn't obvious from the code itself.

## Security rules

- Never commit `.env` or any real API keys/secrets — only `.env.example` with empty values belongs in the repo.
- Never hardcode API keys, passwords, or tokens in source files — load them from environment variables.
- Never log full user messages containing sensitive data, and never log API keys.
- Validate/sanitize any user input before it reaches the LLM prompt or any file/data operation (basic prompt-injection and path-traversal awareness).
- Don't add new external services, third-party APIs, or dependencies without calling it out — keep the trust surface small.

## Token-saving rules (for AI assistants working in this repo)

- Read only the files relevant to the current task — don't read the whole repo "just in case."
- Keep prompt templates in `prompts/` short and focused; avoid bloated system prompts.
- Don't regenerate or rewrite files that don't need to change.
- Summarize instead of pasting large data files (e.g. `data/menu.json`) back in full when discussing them.
- Prefer small, targeted diffs over full-file rewrites.

## Scope discipline

- Only modify the files needed for the current task. Do not touch unrelated files, folders, or configuration as a side effect of a task.
- If a task seems to require changes outside its obvious scope, stop and ask before proceeding.

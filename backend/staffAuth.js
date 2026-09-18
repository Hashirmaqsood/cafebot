// Minimal admin authentication for the staff dashboard. No database
// and no external auth library — a single shared admin password (set
// via ADMIN_PASSWORD) and an in-memory set of valid session tokens,
// the same "no persistence, resets on restart" pattern already used
// for customer order sessions (see orderState.js).
//
// This is intentionally simple (one shared password, not per-staff
// accounts) — enough to keep the dashboard from being open to anyone
// with the link, appropriate for a small cafe's one admin login.

const crypto = require("crypto");

const validTokens = new Set();

function checkPassword(candidate) {
  const real = process.env.ADMIN_PASSWORD || "";
  // Never authenticate if no password has been configured — an empty
  // ADMIN_PASSWORD must not mean "anyone gets in."
  if (!real || typeof candidate !== "string" || !candidate) return false;

  const candidateBuf = Buffer.from(candidate);
  const realBuf = Buffer.from(real);
  // Lengths must match before timingSafeEqual (it throws otherwise);
  // this itself doesn't leak useful timing info since password length
  // isn't a secret worth protecting here.
  if (candidateBuf.length !== realBuf.length) return false;
  return crypto.timingSafeEqual(candidateBuf, realBuf);
}

// Returns a fresh token on success, or null on a wrong/missing password.
function login(password) {
  if (!checkPassword(password)) return null;
  const token = crypto.randomUUID();
  validTokens.add(token);
  return token;
}

function logout(token) {
  validTokens.delete(token);
}

function isValidToken(token) {
  return typeof token === "string" && token.length > 0 && validTokens.has(token);
}

module.exports = { login, logout, isValidToken };

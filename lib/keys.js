import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getOAuthUser, getOAuthRole } from "./oauth.js";

const DATA_DIR = join(process.cwd(), "data");
const KEYS_FILE = join(DATA_DIR, "keys.json");
const USAGE_FILE = join(DATA_DIR, "usage.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return today's date string in YYYY-MM-DD (server local time) */
function getTodayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getDailyQuota() {
  return parseInt(process.env.DAILY_QUOTA, 10) || 10;
}

function getInitialQuota() {
  return parseInt(process.env.INITIAL_QUOTA, 10) || 10;
}

/**
 * Check if a session value is an OAuth session
 */
function isOAuthSession(key) {
  return key && key.startsWith("linuxdo:");
}

/**
 * Extract the Linux.do user ID from an OAuth session value
 */
function extractOAuthId(key) {
  return key.replace("linuxdo:", "");
}

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

/**
 * Load keys config from data/keys.json
 * Re-reads from disk each time so edits take effect without restart
 */
export function loadKeys() {
  try {
    const raw = readFileSync(KEYS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("[Keys] Failed to load keys.json:", e.message);
    return {};
  }
}

/**
 * Validate a key and return its info, or null if invalid
 * Supports both Access Key and OAuth session (linuxdo:<id>)
 * @returns {{ role: 'admin'|'user', name: string } | null}
 */
export function validateKey(key) {
  if (!key) return null;

  // OAuth session
  if (isOAuthSession(key)) {
    const id = extractOAuthId(key);
    const user = getOAuthUser(id);
    if (!user) return null;
    const role = getOAuthRole(id);
    return {
      role,
      name: user.name || user.username,
    };
  }

  // Legacy Access Key
  const keys = loadKeys();
  return keys[key] || null;
}

// ---------------------------------------------------------------------------
// Usage tracking — three-pool model
//
// usage.json format:
// {
//   "linuxdo:12345": {
//     "daily": { "2026-03-08": 3 },
//     "initial_used": 5,
//     "bonus_used": 2
//   }
// }
//
// Backward compat: if value is a plain number, treat as initial_used.
// ---------------------------------------------------------------------------

function loadUsage() {
  try {
    if (!existsSync(USAGE_FILE)) return {};
    const raw = readFileSync(USAGE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveUsage(usage) {
  writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2), "utf-8");
}

/**
 * Normalise a per-user record into the three-pool structure.
 * Handles backward compat with old plain-number format.
 */
function normaliseRecord(record) {
  if (record == null) {
    return { daily: {}, initial_used: 0, bonus_used: 0 };
  }
  // Old format: plain number → treat as initial_used
  if (typeof record === "number") {
    return { daily: {}, initial_used: record, bonus_used: 0 };
  }
  return {
    daily: record.daily || {},
    initial_used: record.initial_used || 0,
    bonus_used: record.bonus_used || 0,
  };
}

/**
 * Get bonus_quota for a user from oauth_users.json (written by redeem system).
 * Returns 0 if not set.
 */
function getBonusQuota(key) {
  if (!isOAuthSession(key)) return 0;
  const id = extractOAuthId(key);
  const user = getOAuthUser(id);
  return (user && user.bonus_quota) || 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get per-pool usage breakdown for a key.
 * @returns {{ dailyUsed, dailyTotal, initialUsed, initialTotal, bonusUsed, bonusTotal }}
 */
function getPoolBreakdown(key) {
  const usage = loadUsage();
  const rec = normaliseRecord(usage[key]);
  const today = getTodayKey();

  const dailyUsed = rec.daily[today] || 0;
  const dailyTotal = getDailyQuota();
  const initialUsed = rec.initial_used;
  const initialTotal = getInitialQuota();
  const bonusUsed = rec.bonus_used;
  const bonusTotal = getBonusQuota(key);

  return {
    dailyUsed,
    dailyTotal,
    initialUsed,
    initialTotal,
    bonusUsed,
    bonusTotal,
  };
}

/**
 * Get total effective usage count (sum of all pools' used).
 * Kept for backward compat — callers that just need a number.
 */
export function getUsage(key) {
  const b = getPoolBreakdown(key);
  return b.dailyUsed + b.initialUsed + b.bonusUsed;
}

/**
 * Increment usage by 1, respecting priority: daily → initial → bonus.
 * Returns the pool name that was consumed ("daily" | "initial" | "bonus" | null).
 */
export function incrementUsage(key) {
  const usage = loadUsage();
  const rec = normaliseRecord(usage[key]);
  const today = getTodayKey();

  const dailyUsed = rec.daily[today] || 0;
  const dailyTotal = getDailyQuota();
  const initialTotal = getInitialQuota();
  const bonusTotal = getBonusQuota(key);

  let pool = null;

  if (dailyUsed < dailyTotal) {
    rec.daily[today] = dailyUsed + 1;
    pool = "daily";
  } else if (rec.initial_used < initialTotal) {
    rec.initial_used += 1;
    pool = "initial";
  } else if (rec.bonus_used < bonusTotal) {
    rec.bonus_used += 1;
    pool = "bonus";
  }

  usage[key] = rec;
  saveUsage(usage);
  console.log(`[Quota] Incremented ${key} pool=${pool}`);
  return pool;
}

/**
 * Check if a key has remaining quota in any pool.
 * Admin keys always return true.
 */
export function hasQuota(key) {
  const info = validateKey(key);
  if (!info) return false;
  if (info.role === "admin") return true;

  const b = getPoolBreakdown(key);
  return (
    b.dailyUsed < b.dailyTotal ||
    b.initialUsed < b.initialTotal ||
    b.bonusUsed < b.bonusTotal
  );
}

/**
 * Get quota info for display.
 * @returns {{
 *   role: string,
 *   name: string,
 *   dailyUsed: number, dailyTotal: number,
 *   initialUsed: number, initialTotal: number,
 *   bonusUsed: number, bonusTotal: number,
 *   totalAvailable: number,
 *   used: number, total: number
 * }}
 */
export function getQuotaInfo(key) {
  const info = validateKey(key);
  if (!info) return null;

  if (info.role === "admin") {
    return {
      role: "admin",
      name: info.name,
      used: 0,
      total: null,
      dailyUsed: 0,
      dailyTotal: 0,
      initialUsed: 0,
      initialTotal: 0,
      bonusUsed: 0,
      bonusTotal: 0,
      totalAvailable: null,
    };
  }

  const b = getPoolBreakdown(key);
  const dailyRemain = Math.max(0, b.dailyTotal - b.dailyUsed);
  const initialRemain = Math.max(0, b.initialTotal - b.initialUsed);
  const bonusRemain = Math.max(0, b.bonusTotal - b.bonusUsed);
  const totalAvailable = dailyRemain + initialRemain + bonusRemain;

  return {
    role: info.role,
    name: info.name,
    ...b,
    totalAvailable,
    // Legacy compat fields
    used: b.dailyUsed + b.initialUsed + b.bonusUsed,
    total: b.dailyTotal + b.initialTotal + b.bonusTotal,
  };
}

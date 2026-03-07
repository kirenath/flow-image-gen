import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getOAuthUser, getOAuthRole, getOAuthQuotaLimit } from "./oauth.js";

const DATA_DIR = join(process.cwd(), "data");
const KEYS_FILE = join(DATA_DIR, "keys.json");
const USAGE_FILE = join(DATA_DIR, "usage.json");

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
 * @returns {{ role: 'admin'|'user', name: string, quota?: number } | null}
 */
export function validateKey(key) {
  if (!key) return null;

  // OAuth session
  if (isOAuthSession(key)) {
    const id = extractOAuthId(key);
    const user = getOAuthUser(id);
    if (!user) return null;
    const role = getOAuthRole(id);
    const quota = getOAuthQuotaLimit(id);
    return {
      role,
      name: user.name || user.username,
      quota: quota,
    };
  }

  // Legacy Access Key
  const keys = loadKeys();
  return keys[key] || null;
}

/**
 * Load usage data
 */
function loadUsage() {
  try {
    if (!existsSync(USAGE_FILE)) return {};
    const raw = readFileSync(USAGE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Save usage data
 */
function saveUsage(usage) {
  writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2), "utf-8");
}

/**
 * Get usage count for a key
 */
export function getUsage(key) {
  const usage = loadUsage();
  return usage[key] || 0;
}

/**
 * Increment usage count for a key and return the new count
 */
export function incrementUsage(key) {
  const usage = loadUsage();
  usage[key] = (usage[key] || 0) + 1;
  saveUsage(usage);
  return usage[key];
}

/**
 * Check if a key has remaining quota
 * Admin keys always return true
 */
export function hasQuota(key) {
  const info = validateKey(key);
  if (!info) return false;
  if (info.role === "admin") return true;
  const used = getUsage(key);
  return used < (info.quota || 0);
}

/**
 * Get quota info for display
 * @returns {{ role: string, name: string, used: number, total: number|null }}
 */
export function getQuotaInfo(key) {
  const info = validateKey(key);
  if (!info) return null;
  const used = getUsage(key);
  return {
    role: info.role,
    name: info.name,
    used,
    total: info.role === "admin" ? null : info.quota || 0,
  };
}

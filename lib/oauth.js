import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");
const OAUTH_USERS_FILE = join(DATA_DIR, "oauth_users.json");

/** Default quota for OAuth users */
const DEFAULT_OAUTH_QUOTA = 10;

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load all OAuth users from data/oauth_users.json
 */
function loadOAuthUsers() {
  try {
    if (!existsSync(OAUTH_USERS_FILE)) return {};
    const raw = readFileSync(OAUTH_USERS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Save OAuth users to data/oauth_users.json
 */
function saveOAuthUsers(users) {
  ensureDataDir();
  writeFileSync(OAUTH_USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

/**
 * Save or update an OAuth user's info
 * @param {object} userInfo - User info from Linux.do API
 */
export function saveOAuthUser(userInfo) {
  const users = loadOAuthUsers();
  users[String(userInfo.id)] = {
    id: userInfo.id,
    username: userInfo.username,
    name: userInfo.name,
    avatar_url: userInfo.avatar_url,
    trust_level: userInfo.trust_level,
    active: userInfo.active,
    silenced: userInfo.silenced,
    updated_at: new Date().toISOString(),
  };
  saveOAuthUsers(users);
}

/**
 * Get an OAuth user by their Linux.do ID
 * @returns {object|null}
 */
export function getOAuthUser(id) {
  const users = loadOAuthUsers();
  return users[String(id)] || null;
}

/**
 * Check if a Linux.do user ID is an admin
 */
export function isAdmin(id) {
  const adminIds = (process.env.LINUXDO_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return adminIds.includes(String(id));
}

/**
 * Get role for an OAuth user
 */
export function getOAuthRole(id) {
  return isAdmin(id) ? "admin" : "user";
}

/**
 * Get quota limit for an OAuth user
 * Admin = null (unlimited), User = DEFAULT_OAUTH_QUOTA
 */
export function getOAuthQuotaLimit(id) {
  return isAdmin(id) ? null : DEFAULT_OAUTH_QUOTA;
}

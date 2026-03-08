import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { updateBonusQuota } from "./oauth.js";

const DATA_DIR = join(process.cwd(), "data");
const REDEEM_FILE = join(DATA_DIR, "redeem_codes.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadRedeemCodes() {
  try {
    if (!existsSync(REDEEM_FILE)) return {};
    const raw = readFileSync(REDEEM_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveRedeemCodes(codes) {
  writeFileSync(REDEEM_FILE, JSON.stringify(codes, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a redeem code.
 * @param {string} code
 * @returns {{ valid: boolean, amount?: number, error?: string }}
 */
export function validateCode(code) {
  if (!code || typeof code !== "string") {
    return { valid: false, error: "兑换码不能为空" };
  }

  const codes = loadRedeemCodes();
  const entry = codes[code.trim()];

  if (!entry) {
    return { valid: false, error: "兑换码无效" };
  }

  if (entry.used_by) {
    return { valid: false, error: "兑换码已被使用" };
  }

  return { valid: true, amount: entry.amount };
}

/**
 * Redeem a code for a user. Marks the code as used and adds bonus quota.
 * @param {string} code - The redeem code
 * @param {string} userKey - The auth key (e.g. "linuxdo:12345")
 * @returns {{ success: boolean, amount?: number, error?: string }}
 */
export function redeemCode(code, userKey) {
  const trimmed = code.trim();

  // Validate first
  const check = validateCode(trimmed);
  if (!check.valid) {
    return { success: false, error: check.error };
  }

  // Extract user ID from OAuth key
  if (!userKey || !userKey.startsWith("linuxdo:")) {
    return { success: false, error: "仅支持 Linux.do 登录用户兑换" };
  }
  const userId = userKey.replace("linuxdo:", "");

  // Update bonus quota in oauth_users.json
  const updated = updateBonusQuota(userId, check.amount);
  if (!updated) {
    return { success: false, error: "用户数据更新失败" };
  }

  // Mark code as used
  const codes = loadRedeemCodes();
  codes[trimmed].used_by = userKey;
  codes[trimmed].used_at = new Date().toISOString();
  saveRedeemCodes(codes);

  console.log(
    `[Redeem] Code "${trimmed}" redeemed by ${userKey}, amount=${check.amount}`,
  );

  return { success: true, amount: check.amount };
}

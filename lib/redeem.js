import supabase from "./supabase.js";
import { updateBonusQuota } from "./oauth.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a redeem code.
 * @param {string} code
 * @returns {Promise<{ valid: boolean, amount?: number, error?: string }>}
 */
export async function validateCode(code) {
  if (!code || typeof code !== "string") {
    return { valid: false, error: "兑换码不能为空" };
  }

  const { data, error } = await supabase
    .from("redeem_codes")
    .select("*")
    .eq("code", code.trim())
    .single();

  if (error || !data) {
    return { valid: false, error: "兑换码无效" };
  }

  if (data.used_by) {
    return { valid: false, error: "兑换码已被使用" };
  }

  return { valid: true, amount: data.amount };
}

/**
 * Redeem a code for a user. Marks the code as used and adds bonus quota.
 * @param {string} code - The redeem code
 * @param {string} userKey - The auth key (e.g. "linuxdo:12345")
 * @returns {Promise<{ success: boolean, amount?: number, error?: string }>}
 */
export async function redeemCode(code, userKey) {
  const trimmed = code.trim();

  // Validate first
  const check = await validateCode(trimmed);
  if (!check.valid) {
    return { success: false, error: check.error };
  }

  // Extract user ID from OAuth key
  if (!userKey || !userKey.startsWith("linuxdo:")) {
    return { success: false, error: "仅支持 Linux.do 登录用户兑换" };
  }
  const userId = userKey.replace("linuxdo:", "");

  // Update bonus quota in users table
  const updated = await updateBonusQuota(userId, check.amount);
  if (!updated) {
    return { success: false, error: "用户数据更新失败" };
  }

  // Mark code as used
  const { error } = await supabase
    .from("redeem_codes")
    .update({
      used_by: userKey,
      used_at: new Date().toISOString(),
    })
    .eq("code", trimmed);

  if (error) {
    console.error("[Redeem] Failed to mark code as used:", error.message);
    return { success: false, error: "兑换码状态更新失败" };
  }

  console.log(
    `[Redeem] Code "${trimmed}" redeemed by ${userKey}, amount=${check.amount}`,
  );

  return { success: true, amount: check.amount };
}

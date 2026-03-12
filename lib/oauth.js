import supabase from "./supabase.js";

/**
 * Save or update an OAuth user's info in Supabase
 * @param {object} userInfo - User info from Linux.do API
 */
export async function saveOAuthUser(userInfo) {
  const { error } = await supabase.from("users").upsert(
    {
      id: String(userInfo.id),
      username: userInfo.username,
      name: userInfo.name,
      avatar_url: userInfo.avatar_url,
      trust_level: userInfo.trust_level,
      active: userInfo.active,
      silenced: userInfo.silenced,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[OAuth] Failed to save user:", error.message);
  }
}

/**
 * Get an OAuth user by their Linux.do ID
 * @returns {object|null}
 */
export async function getOAuthUser(id) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", String(id))
    .single();

  if (error) {
    if (error.code !== "PGRST116") {
      // PGRST116 = no rows found, not a real error
      console.error("[OAuth] Failed to get user:", error.message);
    }
    return null;
  }
  return data;
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
 * Update bonus_quota for an OAuth user (used by redeem code system).
 * Uses atomic RPC to prevent race conditions.
 * @param {string} id - Linux.do user ID
 * @param {number} amount - Amount to add
 * @returns {boolean} true if user exists and was updated
 */
export async function updateBonusQuota(id, amount) {
  const { data, error } = await supabase.rpc("increment_bonus_quota", {
    user_id: String(id),
    amount,
  });

  if (error) {
    console.error("[OAuth] Failed to update bonus_quota:", error.message);
    return false;
  }

  console.log(
    `[OAuth] Updated bonus_quota for user ${id}: +${amount}, total=${data}`,
  );
  return true;
}

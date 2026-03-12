import supabase from "./supabase.js";
import { getOAuthUser, getOAuthRole } from "./oauth.js";

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
// Key validation
// ---------------------------------------------------------------------------

/**
 * Validate a key and return its info, or null if invalid.
 * Only supports OAuth sessions (linuxdo:<id>).
 * @returns {Promise<{ role: 'admin'|'user', name: string } | null>}
 */
export async function validateKey(key) {
  if (!key) return null;

  // Development bypass (Local only)
  if (
    process.env.NODE_ENV === "development" &&
    process.env.LOCAL_DEV_BYPASS === "true" &&
    key === "dev-admin-123456"
  ) {
    return {
      role: "admin",
      name: "DevAdmin (Bypass)",
    };
  }

  // OAuth session
  if (isOAuthSession(key)) {
    const id = extractOAuthId(key);
    const user = await getOAuthUser(id);
    if (!user) return null;
    const role = getOAuthRole(id);
    return {
      role,
      name: user.name || user.username,
    };
  }

  // No legacy key support
  return null;
}

// ---------------------------------------------------------------------------
// Usage tracking — three-pool model via Supabase
//
// usage table: one row per (user_key, date)
//   daily_used   — resets each day (new row)
//   initial_used — lifetime pool (summed across all rows)
//   bonus_used   — lifetime pool (summed across all rows)
// ---------------------------------------------------------------------------

/**
 * Get or create today's usage row for a user_key.
 * Returns the row data.
 */
async function getOrCreateTodayUsage(userKey) {
  const today = getTodayKey();

  // Try to get today's row
  const { data, error } = await supabase
    .from("usage")
    .select("*")
    .eq("user_key", userKey)
    .eq("date", today)
    .single();

  if (data) return data;

  // Row doesn't exist — create it
  if (error && error.code === "PGRST116") {
    const { data: newRow, error: insertErr } = await supabase
      .from("usage")
      .upsert(
        {
          user_key: userKey,
          date: today,
          daily_used: 0,
          initial_used: 0,
          bonus_used: 0,
        },
        { onConflict: "user_key,date" },
      )
      .select()
      .single();

    if (insertErr) {
      console.error("[Usage] Failed to create today's row:", insertErr.message);
      return { daily_used: 0, initial_used: 0, bonus_used: 0 };
    }
    return newRow;
  }

  console.error("[Usage] Unexpected error:", error?.message);
  return { daily_used: 0, initial_used: 0, bonus_used: 0 };
}

/**
 * Get lifetime sums of initial_used and bonus_used across all dates.
 */
async function getLifetimeUsage(userKey) {
  const { data, error } = await supabase
    .from("usage")
    .select("initial_used, bonus_used")
    .eq("user_key", userKey);

  if (error || !data) {
    return { initialUsed: 0, bonusUsed: 0 };
  }

  let initialUsed = 0;
  let bonusUsed = 0;
  for (const row of data) {
    initialUsed += row.initial_used || 0;
    bonusUsed += row.bonus_used || 0;
  }
  return { initialUsed, bonusUsed };
}

/**
 * Get bonus_quota for a user from users table.
 */
async function getBonusQuota(key) {
  if (!isOAuthSession(key)) return 0;
  const id = extractOAuthId(key);
  const user = await getOAuthUser(id);
  return (user && user.bonus_quota) || 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get per-pool usage breakdown for a key.
 * @returns {Promise<{ dailyUsed, dailyTotal, initialUsed, initialTotal, bonusUsed, bonusTotal }>}
 */
async function getPoolBreakdown(key) {
  const todayRow = await getOrCreateTodayUsage(key);
  const lifetime = await getLifetimeUsage(key);

  const dailyUsed = todayRow.daily_used || 0;
  const dailyTotal = getDailyQuota();
  const initialUsed = lifetime.initialUsed;
  const initialTotal = getInitialQuota();
  const bonusUsed = lifetime.bonusUsed;
  const bonusTotal = await getBonusQuota(key);

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
 * Increment usage by 1, respecting priority: daily → initial → bonus.
 * Returns the pool name that was consumed ("daily" | "initial" | "bonus" | null).
 */
export async function incrementUsage(key) {
  const todayRow = await getOrCreateTodayUsage(key);
  const today = getTodayKey();
  const lifetime = await getLifetimeUsage(key);

  const dailyUsed = todayRow.daily_used || 0;
  const dailyTotal = getDailyQuota();
  const initialTotal = getInitialQuota();
  const bonusTotal = await getBonusQuota(key);

  let pool = null;
  const updates = {};

  if (dailyUsed < dailyTotal) {
    updates.daily_used = dailyUsed + 1;
    pool = "daily";
  } else if (lifetime.initialUsed < initialTotal) {
    updates.initial_used = (todayRow.initial_used || 0) + 1;
    pool = "initial";
  } else if (lifetime.bonusUsed < bonusTotal) {
    updates.bonus_used = (todayRow.bonus_used || 0) + 1;
    pool = "bonus";
  }

  if (pool) {
    const { error } = await supabase
      .from("usage")
      .update(updates)
      .eq("user_key", key)
      .eq("date", today);

    if (error) {
      console.error("[Quota] Failed to increment usage:", error.message);
    }
  }

  console.log(`[Quota] Incremented ${key} pool=${pool}`);
  return pool;
}

/**
 * Check if a key has remaining quota in any pool.
 * Admin keys always return true.
 */
export async function hasQuota(key) {
  const info = await validateKey(key);
  if (!info) return false;
  if (info.role === "admin") return true;

  const b = await getPoolBreakdown(key);
  return (
    b.dailyUsed < b.dailyTotal ||
    b.initialUsed < b.initialTotal ||
    b.bonusUsed < b.bonusTotal
  );
}

/**
 * Get quota info for display.
 */
export async function getQuotaInfo(key) {
  const info = await validateKey(key);
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

  const b = await getPoolBreakdown(key);
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

#!/usr/bin/env node

/**
 * One-time migration script: JSON files → Supabase
 *
 * Prerequisites:
 *   1. Run supabase_migration.sql in Supabase SQL Editor first
 *   2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage (run on VPS where JSON files exist):
 *   node scripts/migrate-json-to-supabase.mjs
 *
 * This script migrates:
 *   - data/oauth_users.json → users table
 *   - data/usage.json → usage table
 *   - data/redeem_codes.json → redeem_codes table (if exists)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, "..", "data");

// Load env from .env.local manually (no dotenv dependency)
function loadEnv() {
  const envFile = join(__dirname, "..", ".env.local");
  if (!existsSync(envFile)) {
    console.error("❌ .env.local not found");
    process.exit(1);
  }
  const lines = readFileSync(envFile, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes("YOUR_PROJECT")) {
  console.error(
    "❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const DRY_RUN = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// 1. Migrate oauth_users.json → users table
// ---------------------------------------------------------------------------
async function migrateUsers() {
  const file = join(DATA_DIR, "oauth_users.json");
  if (!existsSync(file)) {
    console.log("⏭️  No oauth_users.json found, skipping users migration");
    return 0;
  }

  const raw = JSON.parse(readFileSync(file, "utf-8"));
  const users = Object.values(raw).map((u) => ({
    id: String(u.id),
    username: u.username,
    name: u.name || null,
    avatar_url: u.avatar_url || null,
    trust_level: u.trust_level ?? 0,
    active: u.active ?? true,
    silenced: u.silenced ?? false,
    bonus_quota: u.bonus_quota ?? 0,
    updated_at: u.updated_at || new Date().toISOString(),
  }));

  console.log(`📦 Migrating ${users.length} users...`);

  // Batch upsert in chunks of 500
  let migrated = 0;
  for (let i = 0; i < users.length; i += 500) {
    const batch = users.slice(i, i + 500);
    const { error } = DRY_RUN
      ? { error: null }
      : await supabase.from("users").upsert(batch, { onConflict: "id" });

    if (error) {
      console.error(
        `  ❌ Users batch ${i}-${i + batch.length}: ${error.message}`,
      );
    } else {
      migrated += batch.length;
      console.log(`  ✅ Users ${i + 1}-${i + batch.length} migrated`);
    }
  }
  return migrated;
}

// ---------------------------------------------------------------------------
// 2. Migrate usage.json → usage table
// ---------------------------------------------------------------------------
async function migrateUsage() {
  const file = join(DATA_DIR, "usage.json");
  if (!existsSync(file)) {
    console.log("⏭️  No usage.json found, skipping usage migration");
    return 0;
  }

  const raw = JSON.parse(readFileSync(file, "utf-8"));
  const rows = [];

  for (const [userKey, record] of Object.entries(raw)) {
    if (typeof record === "number") {
      // Old format: plain number = initial_used
      rows.push({
        user_key: userKey,
        date: new Date().toISOString().split("T")[0],
        daily_used: 0,
        initial_used: record,
        bonus_used: 0,
      });
    } else if (record && typeof record === "object") {
      // New format with daily/initial/bonus
      const dailyDates = Object.keys(record.daily || {});

      if (dailyDates.length > 0) {
        // Create a row for each date that has daily usage
        for (const date of dailyDates) {
          rows.push({
            user_key: userKey,
            date,
            daily_used: record.daily[date] || 0,
            // Put initial/bonus on the first date row only
            initial_used: date === dailyDates[0] ? record.initial_used || 0 : 0,
            bonus_used: date === dailyDates[0] ? record.bonus_used || 0 : 0,
          });
        }
      } else {
        // No daily usage, just initial/bonus
        rows.push({
          user_key: userKey,
          date: new Date().toISOString().split("T")[0],
          daily_used: 0,
          initial_used: record.initial_used || 0,
          bonus_used: record.bonus_used || 0,
        });
      }
    }
  }

  console.log(`📦 Migrating ${rows.length} usage rows...`);

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = DRY_RUN
      ? { error: null }
      : await supabase
          .from("usage")
          .upsert(batch, { onConflict: "user_key,date" });

    if (error) {
      console.error(
        `  ❌ Usage batch ${i}-${i + batch.length}: ${error.message}`,
      );
    } else {
      console.log(`  ✅ Usage ${i + 1}-${i + batch.length} migrated`);
    }
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// 3. Migrate redeem_codes.json → redeem_codes table
// ---------------------------------------------------------------------------
async function migrateRedeemCodes() {
  const file = join(DATA_DIR, "redeem_codes.json");
  if (!existsSync(file)) {
    console.log("⏭️  No redeem_codes.json found, skipping");
    return 0;
  }

  const raw = JSON.parse(readFileSync(file, "utf-8"));
  const codes = Object.entries(raw).map(([code, entry]) => ({
    code,
    amount: entry.amount,
    used_by: entry.used_by || null,
    used_at: entry.used_at || null,
    created_at: entry.created_at
      ? new Date(entry.created_at).toISOString()
      : new Date().toISOString(),
  }));

  console.log(`📦 Migrating ${codes.length} redeem codes...`);

  const { error } = DRY_RUN
    ? { error: null }
    : await supabase.from("redeem_codes").upsert(codes, { onConflict: "code" });

  if (error) {
    console.error(`  ❌ Redeem codes: ${error.message}`);
    return 0;
  }

  console.log(`  ✅ ${codes.length} redeem codes migrated`);
  return codes.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("🚀 Starting JSON → Supabase migration...\n");

  const userCount = await migrateUsers();
  const usageCount = await migrateUsage();
  const redeemCount = await migrateRedeemCodes();

  console.log("\n📊 Migration Summary:");
  console.log(`   Users:        ${userCount}`);
  console.log(`   Usage rows:   ${usageCount}`);
  console.log(`   Redeem codes: ${redeemCount}`);
  if (DRY_RUN) {
    console.log(
      "\n⚠️  DRY RUN — no data was actually written. Remove --dry-run to execute.",
    );
  } else {
    console.log(
      "\n✅ Done! You can now remove the data/ JSON files if desired.",
    );
  }
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});

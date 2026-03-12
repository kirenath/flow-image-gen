-- =============================================================================
-- Supabase Migration for flow-image-gen
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- =============================================================================

-- 1. users (replaces oauth_users.json)
-- Stores Linux.do OAuth user profiles
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,                -- Linux.do user ID (as string)
  username     TEXT NOT NULL,
  name         TEXT,
  avatar_url   TEXT,
  trust_level  INTEGER DEFAULT 0,
  active       BOOLEAN DEFAULT true,
  silenced     BOOLEAN DEFAULT false,
  bonus_quota  INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. usage (replaces usage.json, three-pool quota model)
-- One row per (user_key, date) — tracks daily, initial, and bonus pool usage
CREATE TABLE IF NOT EXISTS usage (
  id            SERIAL PRIMARY KEY,
  user_key      TEXT NOT NULL,                  -- "linuxdo:<id>" session key
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_used    INTEGER DEFAULT 0,
  initial_used  INTEGER DEFAULT 0,
  bonus_used    INTEGER DEFAULT 0,
  UNIQUE(user_key, date)
);
CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage(user_key, date);

-- 3. redeem_codes (replaces redeem_codes.json)
CREATE TABLE IF NOT EXISTS redeem_codes (
  code      TEXT PRIMARY KEY,
  amount    INTEGER NOT NULL,
  used_by   TEXT,                               -- user_key who redeemed
  used_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. generations (NEW — generation history feature)
CREATE TABLE IF NOT EXISTS generations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_key        TEXT NOT NULL,
  model           TEXT,
  prompt          TEXT,
  has_input_image BOOLEAN DEFAULT false,
  image_url       TEXT,                         -- extracted output image URL
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_generations_user ON generations(user_key, created_at DESC);

-- 5. Function to atomically increment bonus_quota
CREATE OR REPLACE FUNCTION increment_bonus_quota(user_id TEXT, amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_quota INTEGER;
BEGIN
  UPDATE users
    SET bonus_quota = bonus_quota + amount,
        updated_at = NOW()
    WHERE id = user_id
    RETURNING bonus_quota INTO new_quota;
  RETURN new_quota;
END;
$$;

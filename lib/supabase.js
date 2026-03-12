import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — database calls will fail",
  );
}

const supabase = createClient(supabaseUrl || "", supabaseKey || "", {
  auth: { persistSession: false },
});

export default supabase;

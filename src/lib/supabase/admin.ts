import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role Supabase client (bypasses RLS), or null when SUPABASE_SERVICE_ROLE_KEY is not set. */
export function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

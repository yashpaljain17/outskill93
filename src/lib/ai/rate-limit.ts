import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Consumes one unit of the guest AI quota (limits live in public.consume_ai_quota).
 * Returns null when the call may go ahead, or a ready error response.
 */
export async function guardAiQuota(
  supabase: SupabaseClient,
  user: User,
  route: "chat" | "checklist" | "community"
): Promise<NextResponse | null> {
  if (!user.is_anonymous) return null;

  const { data, error } = await supabase.rpc("consume_ai_quota", { p_route: route });
  if (error) {
    console.error("consume_ai_quota failed", error);
    return NextResponse.json(
      { error: "AI usage limits are not set up yet. Run supabase/migrations/0005_ai_rate_limit.sql." },
      { status: 503 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "Guest AI limit reached. Create a free account to keep using AI features, or try again later." },
      { status: 429, headers: { "Retry-After": "3600" } }
    );
  }
  return null;
}

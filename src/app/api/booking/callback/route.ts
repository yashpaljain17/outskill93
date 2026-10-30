import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const Body = z.object({
  token: z.uuid(),
  status: z.enum(["confirmed", "declined"]),
  starts_at: z.iso.datetime({ offset: true }).optional(),
  note: z.string().trim().max(500).optional(),
});

/** n8n calls this once the clinic has answered a booking request. */
export async function POST(req: Request) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Callback not configured" }, { status: 503 });
  if (req.headers.get("x-pawpal-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const b = parsed.data;

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data: updated, error } = await supabase.rpc("resolve_booking", {
    p_token: b.token,
    p_status: b.status,
    p_starts_at: b.starts_at ?? null,
    p_note: b.note ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Booking not found or already resolved" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

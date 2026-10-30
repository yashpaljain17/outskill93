import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { BookingOptionSchema, isWorkflowRequest } from "@/lib/booking";

const Body = z.object({
  token: z.uuid(),
  status: z.enum(["confirmed", "declined", "options"]),
  starts_at: z.iso.datetime({ offset: true }).optional(),
  location: z.string().trim().max(300).optional(),
  note: z.string().trim().max(500).optional(),
  options: z.array(BookingOptionSchema).max(5).optional(),
});

/** n8n calls this once it has booked a slot, found alternatives, or given up. */
export async function POST(req: Request) {
  if (!process.env.N8N_WEBHOOK_SECRET) return NextResponse.json({ error: "Callback not configured" }, { status: 503 });
  if (!isWorkflowRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `${issue?.path.join(".")}: ${issue?.message}` }, { status: 400 });
  }
  const b = parsed.data;
  if (b.status === "options" && !b.options?.length) {
    return NextResponse.json({ error: "options: send at least one option" }, { status: 400 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data: updated, error } = await supabase.rpc("resolve_booking", {
    p_token: b.token,
    p_status: b.status,
    p_starts_at: b.starts_at ?? null,
    p_note: b.note ?? null,
    p_options: b.options ?? null,
    p_location: b.location ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Booking not found or already resolved" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

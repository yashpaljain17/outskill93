import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isWorkflowRequest } from "@/lib/booking";

const Body = z.object({
  token: z.uuid(),
  doctor_id: z.uuid(),
  starts_at: z.iso.datetime({ offset: true }),
});

/** Holds a doctor's slot for a pending booking. Called by the n8n workflow before it confirms. */
export async function POST(req: Request, ctx: RouteContext<"/api/clinics/[id]/reserve">) {
  if (!isWorkflowRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send token, doctor_id and starts_at" }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data: reserved, error } = await supabase.rpc("reserve_clinic_slot", {
    p_token: parsed.data.token,
    p_doctor: parsed.data.doctor_id,
    p_starts_at: parsed.data.starts_at,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!reserved) return NextResponse.json({ error: "Slot no longer available" }, { status: 409 });
  return NextResponse.json({ ok: true });
}

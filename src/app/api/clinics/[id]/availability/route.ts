import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isWorkflowRequest } from "@/lib/booking";

const Query = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
});

/** A partner clinic's free doctor slots. Called by the n8n booking workflow ("ask the clinic"). */
export async function GET(req: Request, ctx: RouteContext<"/api/clinics/[id]/availability">) {
  if (!isWorkflowRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success || !z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Pass from and to as ISO date-times" }, { status: 400 });
  }
  const from = new Date(parsed.data.from);
  const to = new Date(Math.min(new Date(parsed.data.to).getTime(), from.getTime() + 31 * 86400_000));

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const [{ data: clinic }, { data: slots, error }] = await Promise.all([
    supabase.from("clinics").select("id, name, address, online_booking").eq("id", id).maybeSingle(),
    supabase.rpc("clinic_availability", { p_clinic: id, p_from: from.toISOString(), p_to: to.toISOString() }),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!clinic?.online_booking) return NextResponse.json({ error: "Clinic doesn't take online bookings" }, { status: 404 });

  return NextResponse.json({
    clinic_id: clinic.id,
    clinic_name: clinic.name,
    address: clinic.address,
    reserve_url: `${new URL(req.url).origin}/api/clinics/${clinic.id}/reserve`,
    slots: (slots ?? []).map((s: { doctor_id: string; doctor_name: string; specialties: string[]; starts_at: string; ends_at: string }) => ({
      doctor_id: s.doctor_id,
      doctor_name: s.doctor_name,
      specialties: s.specialties,
      starts_at: new Date(s.starts_at).toISOString(),
      ends_at: new Date(s.ends_at).toISOString(),
    })),
  });
}

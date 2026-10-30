import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserClient } from "@/lib/supabase/server";
import { chooseBookingOption } from "@/lib/booking";

const Body = z.object({
  appointment_id: z.uuid(),
  /** 0-based index into the offered options, or null to decline them all. */
  choice: z.number().int().min(0).max(4).nullable(),
});

export async function POST(req: Request) {
  const auth = await getUserClient();
  if (!auth) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid choice" }, { status: 400 });

  const result = await chooseBookingOption(
    auth.supabase,
    auth.user,
    new URL(req.url).origin,
    parsed.data.appointment_id,
    parsed.data.choice
  );
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

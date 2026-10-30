import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserClient } from "@/lib/supabase/server";
import { ClinicInputSchema, createBookingRequest } from "@/lib/booking";

const Body = z.object({
  pet_id: z.uuid(),
  preferred_at: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(1000).optional(),
  contact: z.string().trim().min(3).max(120),
  clinic: ClinicInputSchema,
});

const HOUR = 3600_000;

/** Booking request from the Nearby page for one specific clinic. */
export async function POST(req: Request) {
  const auth = await getUserClient();
  if (!auth) return NextResponse.json({ error: "Sign in to book" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the booking details" }, { status: 400 });
  const b = parsed.data;
  const preferredAt = new Date(b.preferred_at);

  const result = await createBookingRequest(auth.supabase, auth.user, new URL(req.url).origin, {
    petId: b.pet_id,
    reason: b.reason,
    notes: b.notes,
    contact: b.contact,
    clinic: b.clinic,
    // The workflow books the preferred time if it's free, otherwise offers nearby slots.
    window: {
      from: new Date(preferredAt.getTime() - 12 * HOUR),
      to: new Date(preferredAt.getTime() + 12 * HOUR),
      timeOfDay: "any",
      preferredAt,
    },
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

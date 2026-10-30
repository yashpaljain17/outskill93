import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserClient } from "@/lib/supabase/server";
import { petAge } from "@/lib/pet";
import type { Pet } from "@/lib/types";

const Body = z.object({
  pet_id: z.uuid(),
  preferred_at: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(1000).optional(),
  contact: z.string().trim().min(3).max(120),
  clinic: z.object({
    id: z.string().max(60),
    clinic_id: z.uuid().nullable().optional(),
    name: z.string().max(200),
    lat: z.number(),
    lon: z.number(),
    address: z.string().max(300).nullable(),
    phone: z.string().max(80).nullable(),
    email: z.string().max(200).nullable(),
    website: z.string().max(300).nullable(),
  }),
});

/**
 * Records a 'requested' vet appointment and hands it to the n8n booking workflow.
 * n8n contacts the clinic and later calls /api/booking/callback to confirm or decline.
 */
export async function POST(req: Request) {
  const auth = await getUserClient();
  if (!auth) return NextResponse.json({ error: "Sign in to book" }, { status: 401 });
  const { supabase, user } = auth;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the booking details" }, { status: 400 });
  const b = parsed.data;

  const { data: pet, error: petError } = await supabase.from("pets").select("*").eq("id", b.pet_id).single<Pet>();
  if (petError || !pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const token = crypto.randomUUID();
  const { data: appt, error } = await supabase
    .from("appointments")
    .insert({
      pet_id: pet.id,
      kind: "vet",
      title: `${b.reason} at ${b.clinic.name}`,
      starts_at: b.preferred_at,
      location: [b.clinic.name, b.clinic.address].filter(Boolean).join(", "),
      notes: b.notes || null,
      status: "requested",
      booking_token: token,
      clinic: b.clinic,
    })
    .select("id")
    .single();
  if (error) {
    const needsMigration = /booking_token|clinic|status_check/.test(error.message);
    return NextResponse.json(
      { error: needsMigration ? "Run supabase/migrations/0002_bookings.sql in Supabase first." : error.message },
      { status: 500 }
    );
  }

  const webhook = process.env.N8N_BOOKING_WEBHOOK_URL;
  if (!webhook) return NextResponse.json({ id: appt.id, sent: false });

  // Directory clinics carry where to send requests; the client can't override these.
  const { data: listed } = b.clinic.clinic_id
    ? await supabase.from("clinics").select("online_booking, booking_email, booking_whatsapp").eq("id", b.clinic.clinic_id).maybeSingle()
    : { data: null };

  const payload = {
    booking_id: appt.id,
    callback: { url: `${new URL(req.url).origin}/api/booking/callback`, token },
    requested_at: b.preferred_at,
    reason: b.reason,
    notes: b.notes ?? null,
    clinic: {
      ...b.clinic,
      online_booking: listed?.online_booking ?? false,
      booking_email: listed?.booking_email ?? null,
      booking_whatsapp: listed?.booking_whatsapp ?? null,
    },
    pet: { name: pet.name, species: pet.species, breed: pet.breed, sex: pet.sex, age: petAge(pet.birth_date), weight_kg: pet.weight_kg },
    owner: {
      name: user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "PawPal user",
      contact: b.contact,
    },
  };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET && { "X-PawPal-Secret": process.env.N8N_WEBHOOK_SECRET }),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`n8n ${res.status}`);
  } catch {
    // Don't leave a request nobody will act on.
    await supabase.from("appointments").delete().eq("id", appt.id);
    return NextResponse.json({ error: "Couldn't reach the booking service — try again or call the clinic." }, { status: 502 });
  }

  return NextResponse.json({ id: appt.id, sent: true });
}

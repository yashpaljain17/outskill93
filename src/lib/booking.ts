import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { petAge } from "@/lib/pet";
import type { Pet } from "@/lib/types";

/** Where PawPal's partner-clinic hours live. The n8n workflow converts everything to this zone. */
export const BOOKING_TIMEZONE = "Asia/Kolkata";
export const VISIT_MINUTES = 30;
export const TRAVEL_BUFFER_MINUTES = 15;
export const BOOKABLE_HOURS = { start: "09:00", end: "20:00", days: [1, 2, 3, 4, 5, 6] };

/** A slot the workflow offers when the requested window can't be met. */
export const BookingOptionSchema = z.object({
  clinic_id: z.string(),
  clinic_name: z.string(),
  address: z.string().nullable().optional(),
  doctor_id: z.string(),
  doctor_name: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  reserve_url: z.string(),
});
export type BookingOption = z.infer<typeof BookingOptionSchema>;

export const ClinicInputSchema = z.object({
  id: z.string().max(60),
  clinic_id: z.uuid().nullable().optional(),
  name: z.string().max(200),
  lat: z.number(),
  lon: z.number(),
  address: z.string().max(300).nullable(),
  phone: z.string().max(80).nullable(),
  email: z.string().max(200).nullable(),
  website: z.string().max(300).nullable(),
});
export type ClinicInput = z.infer<typeof ClinicInputSchema>;

export const TIME_OF_DAY = ["any", "morning", "afternoon", "evening"] as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

export interface BookingRequestInput {
  petId: string;
  reason: string;
  notes?: string | null;
  contact: string;
  /** A specific clinic (Nearby page). Without one, every partner clinic is asked. */
  clinic?: ClinicInput | null;
  /** Free-text clinic name from a voice request, matched against partner clinics. */
  clinicName?: string | null;
  window: { from: Date; to: Date; timeOfDay: TimeOfDay; preferredAt?: Date | null };
}

interface DirectoryClinic {
  id: string;
  osm_id: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  online_booking: boolean;
  booking_email: string | null;
  booking_whatsapp: string | null;
}

export function workflowHeaders(): Record<string, string> {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  return { "Content-Type": "application/json", ...(secret && { "X-PawPal-Secret": secret }) };
}

/** Requests from the n8n workflow must carry the shared secret. */
export function isWorkflowRequest(req: Request) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  return !!secret && req.headers.get("x-pawpal-secret") === secret;
}

export function choiceWebhookUrl() {
  const base = process.env.N8N_BOOKING_WEBHOOK_URL;
  return process.env.N8N_CHOICE_WEBHOOK_URL || (base ? `${base.replace(/\/$/, "")}-choice` : null);
}

function ownerOf(user: User, contact: string) {
  return {
    name: user.user_metadata?.display_name || user.email?.split("@")[0] || (user.is_anonymous ? "Guest" : "PawPal user"),
    email: user.email ?? null,
    contact,
  };
}

function petSummary(pet: Pet) {
  return {
    id: pet.id,
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    sex: pet.sex,
    age: petAge(pet.birth_date),
    weight_kg: pet.weight_kg,
    allergies: pet.allergies,
  };
}

const clinicEndpoints = (origin: string, clinicId: string | null) =>
  clinicId
    ? {
        availability_url: `${origin}/api/clinics/${clinicId}/availability`,
        reserve_url: `${origin}/api/clinics/${clinicId}/reserve`,
      }
    : { availability_url: null, reserve_url: null };

/**
 * Saves a 'requested' appointment and hands it to the n8n booking workflow, which checks the
 * owner's calendar and the clinics' doctor schedules, then calls /api/booking/callback.
 */
export async function createBookingRequest(
  supabase: SupabaseClient,
  user: User,
  origin: string,
  input: BookingRequestInput
): Promise<{ id: string; sent: boolean; clinics: string[] } | { error: string; status: number }> {
  const { data: pet } = await supabase.from("pets").select("*").eq("id", input.petId).single<Pet>();
  if (!pet) return { error: "Pet not found", status: 404 };

  // Which clinics the workflow should ask.
  let directory: DirectoryClinic[] = [];
  const columns = "id, osm_id, name, address, phone, email, online_booking, booking_email, booking_whatsapp";
  if (input.clinic?.clinic_id) {
    const { data } = await supabase.from("clinics").select(columns).eq("id", input.clinic.clinic_id);
    directory = (data ?? []) as DirectoryClinic[];
  } else if (!input.clinic) {
    const { data } = await supabase.from("clinics").select(columns).eq("online_booking", true).order("name");
    directory = (data ?? []) as DirectoryClinic[];
    const wanted = input.clinicName?.toLowerCase().trim();
    if (wanted) {
      const words = wanted.split(/\s+/).filter((w) => w.length > 2 && !["clinic", "vet", "the", "pawpal", "partner"].includes(w));
      const named = directory.filter((c) => words.some((w) => c.name.toLowerCase().includes(w)));
      if (named.length) directory = named;
    }
  }

  const clinics = input.clinic
    ? [
        {
          id: input.clinic.id,
          clinic_id: input.clinic.clinic_id ?? null,
          name: input.clinic.name,
          address: input.clinic.address,
          phone: input.clinic.phone,
          online_booking: directory[0]?.online_booking ?? false,
          booking_email: directory[0]?.booking_email ?? null,
          booking_whatsapp: directory[0]?.booking_whatsapp ?? null,
          ...clinicEndpoints(origin, directory[0]?.online_booking ? directory[0].id : null),
        },
      ]
    : directory.map((c) => ({
        id: c.osm_id ?? `clinic/${c.id}`,
        clinic_id: c.id,
        name: c.name,
        address: c.address,
        phone: c.phone,
        online_booking: c.online_booking,
        booking_email: c.booking_email,
        booking_whatsapp: c.booking_whatsapp,
        ...clinicEndpoints(origin, c.online_booking ? c.id : null),
      }));
  if (!clinics.length) return { error: "No partner clinics take online bookings yet", status: 422 };

  const token = crypto.randomUUID();
  const placeholderStart = input.window.preferredAt ?? input.window.from;
  const single = clinics.length === 1 ? clinics[0] : null;
  const { data: appt, error } = await supabase
    .from("appointments")
    .insert({
      pet_id: pet.id,
      kind: "vet",
      title: single ? `${input.reason} at ${single.name}` : input.reason,
      starts_at: placeholderStart.toISOString(),
      location: single ? [single.name, single.address].filter(Boolean).join(", ") : "Finding a clinic…",
      notes: input.notes || null,
      status: "requested",
      booking_token: token,
      clinic: single ?? { candidates: clinics.map((c) => c.name) },
    })
    .select("id")
    .single();
  if (error) {
    const needsMigration = /booking_token|clinic|status_check|booking_options/.test(error.message);
    return {
      error: needsMigration ? "Run the latest supabase/migrations in Supabase first." : error.message,
      status: 500,
    };
  }

  const webhook = process.env.N8N_BOOKING_WEBHOOK_URL;
  if (!webhook) return { id: appt.id, sent: false, clinics: clinics.map((c) => c.name) };

  const payload = {
    type: "booking_request",
    booking_id: appt.id,
    callback: { url: `${origin}/api/booking/callback`, token },
    reason: input.reason,
    notes: input.notes ?? null,
    timezone: BOOKING_TIMEZONE,
    window: {
      from: input.window.from.toISOString(),
      to: input.window.to.toISOString(),
      time_of_day: input.window.timeOfDay,
      preferred_at: input.window.preferredAt?.toISOString() ?? null,
    },
    duration_minutes: VISIT_MINUTES,
    buffer_minutes: TRAVEL_BUFFER_MINUTES,
    bookable_hours: BOOKABLE_HOURS,
    calendar_id: "primary",
    clinics,
    pet: petSummary(pet),
    owner: ownerOf(user, input.contact),
  };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: workflowHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`n8n ${res.status}`);
  } catch {
    // Don't leave a request nobody will act on.
    await supabase.from("appointments").delete().eq("id", appt.id);
    return { error: "Couldn't reach the booking service — try again in a moment.", status: 502 };
  }
  return { id: appt.id, sent: true, clinics: clinics.map((c) => c.name) };
}

/**
 * The owner's answer to offered slots: book one (sent back to the workflow) or decline all.
 * `choice` is a 0-based option index, or null to decline.
 */
export async function chooseBookingOption(
  supabase: SupabaseClient,
  user: User,
  origin: string,
  appointmentId: string,
  choice: number | null
): Promise<{ ok: true; option: BookingOption | null } | { error: string; status: number }> {
  const { data: appt } = await supabase
    .from("appointments")
    .select("id, pet_id, title, notes, status, booking_token, booking_options")
    .eq("id", appointmentId)
    .single();
  if (!appt) return { error: "Booking not found", status: 404 };
  if (appt.status !== "options") return { error: "This booking isn't waiting for your choice", status: 409 };

  if (choice === null) {
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled", booking_token: null, booking_options: null })
      .eq("id", appt.id);
    return error ? { error: error.message, status: 500 } : { ok: true, option: null };
  }

  const options = z.array(BookingOptionSchema).safeParse(appt.booking_options);
  const option = options.success ? options.data[choice] : undefined;
  if (!option) return { error: "That option doesn't exist", status: 400 };

  const webhook = choiceWebhookUrl();
  if (!webhook) return { error: "The booking workflow isn't connected", status: 503 };

  const { data: pet } = await supabase.from("pets").select("*").eq("id", appt.pet_id).single<Pet>();
  const { error } = await supabase.from("appointments").update({ status: "requested" }).eq("id", appt.id);
  if (error) return { error: error.message, status: 500 };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: workflowHeaders(),
      body: JSON.stringify({
        type: "booking_choice",
        booking_id: appt.id,
        callback: { url: `${origin}/api/booking/callback`, token: appt.booking_token },
        reason: appt.title,
        notes: appt.notes,
        timezone: BOOKING_TIMEZONE,
        calendar_id: "primary",
        slot: option,
        pet: pet ? petSummary(pet) : null,
        owner: ownerOf(user, user.email ?? ""),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`n8n ${res.status}`);
  } catch {
    await supabase.from("appointments").update({ status: "options" }).eq("id", appt.id);
    return { error: "Couldn't reach the booking service — try again in a moment.", status: 502 };
  }
  return { ok: true, option };
}

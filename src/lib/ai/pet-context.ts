import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Appointment, Pet, Routine, Vaccination } from "@/lib/types";
import { petAge } from "@/lib/pet";

/** Builds a compact text description of the user's pets for the model. */
export async function buildPetContext(supabase: SupabaseClient, focusPetId?: string | null) {
  const [{ data: pets }, { data: routines }, { data: vaccines }, { data: appts }, { data: pending }] = await Promise.all([
    supabase.from("pets").select("*").order("created_at"),
    supabase.from("routines").select("*").eq("active", true),
    supabase.from("vaccinations").select("*").order("next_due"),
    supabase
      .from("appointments")
      .select("*")
      .eq("status", "scheduled")
      .gte("starts_at", new Date(Date.now() - 86400000).toISOString())
      .order("starts_at")
      .limit(20),
    supabase
      .from("appointments")
      .select("id, pet_id, title, status, starts_at, location, booking_options")
      .in("status", ["requested", "options"])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const petList = (pets ?? []) as Pet[];
  if (petList.length === 0) return { text: "The owner has not added any pets yet.", pets: petList };

  const lines: string[] = [];
  for (const p of petList) {
    const focus = p.id === focusPetId ? " (CURRENTLY SELECTED)" : "";
    lines.push(
      `## ${p.name}${focus} — id: ${p.id}`,
      `${p.species}${p.breed ? `, ${p.breed}` : ""}${p.sex ? `, ${p.sex}` : ""}${
        p.birth_date ? `, age ${petAge(p.birth_date)} (born ${p.birth_date})` : ""
      }${p.weight_kg ? `, ${p.weight_kg} kg` : ""}`
    );
    if (p.allergies) lines.push(`Allergies: ${p.allergies}`);
    if (p.notes) lines.push(`Notes: ${p.notes}`);

    const r = ((routines ?? []) as Routine[]).filter((x) => x.pet_id === p.id);
    if (r.length)
      lines.push(
        "Routines:",
        ...r.map(
          (x) =>
            `- [${x.kind}] ${x.title}${x.times.length ? ` at ${x.times.join(", ")}` : ""}${
              x.amount ? ` (${x.amount})` : ""
            }${x.days.length < 7 ? ` on days ${x.days.join(",")}` : " daily"}`
        )
      );

    const v = ((vaccines ?? []) as Vaccination[]).filter((x) => x.pet_id === p.id);
    if (v.length)
      lines.push(
        "Vaccinations:",
        ...v.map(
          (x) => `- ${x.vaccine}: given ${x.given_on ?? "unknown"}, next due ${x.next_due ?? "unknown"}`
        )
      );

    const a = ((appts ?? []) as Appointment[]).filter((x) => x.pet_id === p.id);
    if (a.length)
      lines.push(
        "Upcoming appointments:",
        ...a.map((x) => `- [${x.kind}] ${x.title} at ${x.starts_at}${x.location ? ` — ${x.location}` : ""}`)
      );
    lines.push("");
  }

  const inProgress = (pending ?? []) as (Pick<Appointment, "id" | "pet_id" | "title" | "status" | "starts_at" | "location"> & {
    booking_options: { clinic_name: string; doctor_name: string; starts_at: string }[] | null;
  })[];
  if (inProgress.length) {
    const when = (iso: string) =>
      new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    lines.push("## Bookings in progress");
    for (const b of inProgress) {
      const pet = petList.find((p) => p.id === b.pet_id)?.name ?? "pet";
      if (b.status === "options" && b.booking_options?.length) {
        lines.push(
          `- ${b.title} for ${pet} (booking id: ${b.id}) — WAITING FOR THE OWNER'S CHOICE. Offered:`,
          ...b.booking_options.map((o, i) => `  ${i + 1}) ${when(o.starts_at)} with ${o.doctor_name} at ${o.clinic_name}`)
        );
      } else {
        lines.push(`- ${b.title} for ${pet} (booking id: ${b.id}) — clinics are being contacted`);
      }
    }
  }
  return { text: lines.join("\n"), pets: petList };
}

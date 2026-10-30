import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO } from "./pet";

/** Seeds a realistic demo pet so a new account (or a judge) sees a full app. */
export async function createSamplePet(supabase: SupabaseClient) {
  const now = new Date();
  const daysFromNow = (n: number) => todayISO(new Date(now.getTime() + n * 86400000));
  const birth = new Date(now);
  birth.setFullYear(now.getFullYear() - 3);

  const { data: pet, error } = await supabase
    .from("pets")
    .insert({
      name: "Bruno",
      species: "dog",
      breed: "Golden Retriever",
      sex: "male",
      birth_date: todayISO(birth),
      weight_kg: 29.5,
      allergies: "Chicken",
      notes: "Loves fetch, nervous around fireworks. Vet: Dr. Mehta at Happy Paws Clinic.",
    })
    .select()
    .single();
  if (error || !pet) throw new Error(error?.message ?? "Could not create sample pet");

  const appt = new Date(now.getTime() + 5 * 86400000);
  appt.setHours(10, 30, 0, 0);
  const groom = new Date(now.getTime() + 12 * 86400000);
  groom.setHours(15, 0, 0, 0);

  const everyDay = [0, 1, 2, 3, 4, 5, 6];
  // Bulk inserts null out columns missing from any row, so every row sets every column.
  const results = await Promise.all([
    supabase.from("routines").insert([
      { pet_id: pet.id, kind: "feeding", title: "Breakfast", times: ["08:00"], days: everyDay, amount: "1.5 cups salmon kibble" },
      { pet_id: pet.id, kind: "feeding", title: "Dinner", times: ["18:30"], days: everyDay, amount: "1.5 cups salmon kibble" },
      { pet_id: pet.id, kind: "walk", title: "Walk", times: ["07:30", "19:30"], days: everyDay, amount: "30 min" },
      { pet_id: pet.id, kind: "medication", title: "Joint supplement", times: ["08:00"], days: everyDay, amount: "1 chew" },
      { pet_id: pet.id, kind: "grooming", title: "Brush coat", times: ["20:00"], days: [0, 3], amount: "10 min" },
    ]),
    supabase.from("vaccinations").insert([
      { pet_id: pet.id, vaccine: "Rabies", given_on: daysFromNow(-356), next_due: daysFromNow(9), clinic: "Happy Paws Clinic" },
      { pet_id: pet.id, vaccine: "DHPP", given_on: daysFromNow(-200), next_due: daysFromNow(165), clinic: "Happy Paws Clinic" },
      { pet_id: pet.id, vaccine: "Bordetella", given_on: daysFromNow(-190), next_due: daysFromNow(-8), clinic: "Happy Paws Clinic" },
    ]),
    supabase.from("appointments").insert([
      { pet_id: pet.id, kind: "vet", title: "Annual check-up + rabies booster", starts_at: appt.toISOString(), location: "Happy Paws Clinic" },
      { pet_id: pet.id, kind: "grooming", title: "Bath & nail trim", starts_at: groom.toISOString(), location: "Suds & Tails" },
    ]),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    await supabase.from("pets").delete().eq("id", pet.id); // cascades to anything that did insert
    throw new Error(failed.error.message);
  }
  return pet.id as string;
}

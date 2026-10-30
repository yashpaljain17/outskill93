import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChecklistDraft } from "@/lib/ai/checklist";
import { todayISO } from "./pet";
import type { RoutineKind } from "./types";

type DraftItem = ChecklistDraft["items"][number];

const ROUTINE_CATEGORIES = new Set<RoutineKind>(["feeding", "walk", "medication", "grooming", "play", "training"]);
const DEFAULT_TIMES: Record<string, string[]> = {
  daily: ["09:00"],
  twice_daily: ["08:00", "20:00"],
  three_times_daily: ["08:00", "14:00", "20:00"],
  weekly: ["10:00"],
};

export function isRoutineCandidate(item: DraftItem) {
  return item.frequency in DEFAULT_TIMES;
}

/** Converts repeating checklist steps into routines so they show on the Today list. */
export async function createRoutinesFromItems(supabase: SupabaseClient, petId: string, items: DraftItem[]) {
  const rows = items.filter(isRoutineCandidate).map((item) => {
    const kind: RoutineKind = ROUTINE_CATEGORIES.has(item.category as RoutineKind)
      ? (item.category as RoutineKind)
      : "other";
    const endsOn = item.duration_days
      ? todayISO(new Date(Date.now() + (item.duration_days - 1) * 86400000))
      : null;
    return {
      pet_id: petId,
      kind,
      title: item.title,
      times: item.times.length ? item.times : DEFAULT_TIMES[item.frequency],
      days: item.frequency === "weekly" ? [new Date().getDay()] : [0, 1, 2, 3, 4, 5, 6],
      notes: item.details || null,
      ends_on: endsOn,
    };
  });
  if (!rows.length) return 0;
  const { error } = await supabase.from("routines").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

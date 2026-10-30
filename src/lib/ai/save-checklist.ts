import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChecklistDraft } from "./checklist";

export const FREQUENCY_LABEL: Record<string, string> = {
  once: "Once",
  daily: "Daily",
  twice_daily: "Twice daily",
  three_times_daily: "3× daily",
  weekly: "Weekly",
  as_needed: "As needed",
};

/** Persists a (possibly user-edited) checklist draft and returns the new checklist id. */
export async function saveChecklistDraft(
  supabase: SupabaseClient,
  draft: ChecklistDraft,
  petId: string | null,
  sourceText: string
): Promise<string> {
  const { data, error } = await supabase
    .from("checklists")
    .insert({
      pet_id: petId,
      title: draft.title,
      summary: draft.summary,
      source_text: sourceText,
      safety_notes: draft.safety_notes,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save checklist");

  if (draft.items.length) {
    const { error: itemsError } = await supabase.from("checklist_items").insert(
      draft.items.map((item, i) => ({
        checklist_id: data.id,
        position: i,
        title: item.title,
        details: item.details || null,
        category: item.category,
        frequency: FREQUENCY_LABEL[item.frequency] ?? item.frequency,
        time_of_day: [
          item.times.join(", "),
          item.duration_days ? `for ${item.duration_days} day${item.duration_days === 1 ? "" : "s"}` : "",
        ]
          .filter(Boolean)
          .join(" · ") || null,
      }))
    );
    if (itemsError) throw new Error(itemsError.message);
  }
  return data.id;
}

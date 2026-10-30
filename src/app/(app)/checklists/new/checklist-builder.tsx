"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/app/fields";
import { useSupabase } from "@/hooks/use-supabase";
import { must, useRows } from "@/hooks/use-rows";
import type { ChecklistDraft } from "@/lib/ai/checklist";
import { saveChecklistDraft } from "@/lib/ai/save-checklist";
import { createRoutinesFromItems, isRoutineCandidate } from "@/lib/checklist-routines";
import type { Pet } from "@/lib/types";

type DraftItem = ChecklistDraft["items"][number];

const EXAMPLES = [
  {
    label: "Post-spay recovery",
    text: `Discharge notes for Luna (spay surgery today):
- Keep the cone on at all times for 10 days, even at night.
- Give Meloxicam 1.5mg once daily with food for 5 days, starting tomorrow morning.
- Check the incision twice a day for redness, swelling or discharge.
- Leash walks only, 10 minutes, 3 times a day. No running, jumping or stairs for 14 days.
- Small meal tonight (half portion), normal food from tomorrow.
- No baths or swimming until stitches are removed.
- Recheck appointment in 10 days for stitch removal.
Call us if she vomits more than once, won't eat for 24 hours, or the wound opens.`,
  },
  {
    label: "New puppy routine",
    text: `Our breeder's advice for the first month with our 9-week-old Labrador puppy: feed 3 meals a day (7am, 1pm, 6pm) of puppy kibble, about 1/2 cup each. Take him out to potty right after waking, after every meal and every 2 hours. Short 5-minute play sessions, no long walks until vaccines are complete. Brush teeth twice a week. Practice "sit" and name recognition 5 minutes twice a day. Crate at night next to our bed.`,
  },
  {
    label: "Senior cat kidney diet",
    text: `Vet says Milo (14yo cat) has early kidney disease. Switch gradually to the renal diet over 7 days (25% new food days 1-2, 50% days 3-4, 75% days 5-6, 100% day 7). Encourage water: add a fountain and give wet food twice daily. Weigh him every week and write it down. Blood test recheck in 3 months.`,
  },
];

export function ChecklistBuilder({ initialPetId }: { initialPetId: string | null }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [petId, setPetId] = useState<string>(initialPetId ?? "");
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ChecklistDraft | null>(null);
  const [addRoutines, setAddRoutines] = useState(true);

  const { data: pets } = useRows(
    async () => must(await supabase.from("pets").select("*").order("created_at")) as Pet[],
    []
  );
  // Defaults to the first pet once pets load.
  const effectivePetId = petId || pets?.[0]?.id || "";

  async function generate() {
    if (instructions.trim().length < 10) return toast.error("Paste or type the care instructions first.");
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions, petId: effectivePetId || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Generation failed");
      setDraft(body.draft as ChecklistDraft);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function updateItem(i: number, patch: Partial<DraftItem>) {
    setDraft((d) => d && { ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  }
  function move(i: number, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const items = [...d.items];
      const j = i + dir;
      if (j < 0 || j >= items.length) return d;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...d, items };
    });
  }

  async function save() {
    if (!draft) return;
    const cleaned = { ...draft, items: draft.items.filter((i) => i.title.trim()) };
    if (!cleaned.items.length) return toast.error("Add at least one step.");
    setSaving(true);
    try {
      const id = await saveChecklistDraft(supabase, cleaned, effectivePetId || null, instructions);
      let routines = 0;
      if (addRoutines && effectivePetId) routines = await createRoutinesFromItems(supabase, effectivePetId, cleaned.items);
      toast.success(routines ? `Checklist saved and ${routines} routine${routines === 1 ? "" : "s"} added to Today` : "Checklist saved");
      router.push(`/checklists/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  const repeating = draft?.items.filter(isRoutineCandidate).length ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI care checklist</h1>
        <p className="text-muted-foreground">
          Paste instructions from your vet, groomer or trainer. PawPal drafts a checklist you can edit before saving.
        </p>
      </div>

      {!draft && (
        <Card>
          <CardContent className="space-y-4 pt-2">
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <Field label="For which pet?" htmlFor="pet">
                <NativeSelect id="pet" value={effectivePetId} onChange={(e) => setPetId(e.target.value)}>
                  <option value="">No specific pet</option>
                  {pets?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Try an example">
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <Button key={ex.label} type="button" variant="outline" size="sm" onClick={() => setInstructions(ex.text)}>
                      {ex.label}
                    </Button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label="Care instructions" htmlFor="instructions">
              <Textarea
                id="instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={10}
                placeholder="e.g. Give 1 tablet of Apoquel with breakfast for 14 days, wipe paws after walks, recheck in 2 weeks…"
                className="min-h-56"
              />
            </Field>
            <Button onClick={generate} disabled={generating} className="h-10 w-full sm:w-auto">
              {generating ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {generating ? "Building your checklist…" : "Generate checklist"}
            </Button>
          </CardContent>
        </Card>
      )}

      {draft && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 font-heading text-xl">
                <Sparkles className="size-5 text-primary" /> Review & edit
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                <RotateCcw /> Start over
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Title" htmlFor="title">
                <Input id="title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </Field>
              <Field label="Summary" htmlFor="summary">
                <Textarea id="summary" value={draft.summary} rows={2} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
              </Field>

              <div className="space-y-2">
                {draft.items.map((item, i) => (
                  <div key={i} className="rounded-xl border bg-background p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <Input value={item.title} onChange={(e) => updateItem(i, { title: e.target.value })} className="font-medium" />
                        <Textarea
                          value={item.details}
                          rows={1}
                          placeholder="Details (optional)"
                          onChange={(e) => updateItem(i, { details: e.target.value })}
                          className="min-h-9 text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          <NativeSelect
                            value={item.frequency}
                            onChange={(e) => updateItem(i, { frequency: e.target.value as DraftItem["frequency"] })}
                            className="w-auto"
                            aria-label="Frequency"
                          >
                            <option value="once">Once</option>
                            <option value="daily">Daily</option>
                            <option value="twice_daily">Twice daily</option>
                            <option value="three_times_daily">3× daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="as_needed">As needed</option>
                          </NativeSelect>
                          <TimesInput key={`${i}:${item.times.join()}`} times={item.times} onChange={(times) => updateItem(i, { times })} />
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Input
                              type="number"
                              min={0}
                              value={item.duration_days}
                              aria-label="Duration in days"
                              className="w-16"
                              onChange={(e) => updateItem(i, { duration_days: Math.max(0, Number(e.target.value) || 0) })}
                            />
                            days
                          </div>
                          <span className="rounded-full bg-secondary px-2 py-1 text-xs capitalize">{item.category}</span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <Button variant="ghost" size="icon-sm" aria-label="Move up" onClick={() => move(i, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Move down" onClick={() => move(i, 1)}>
                          <ArrowDown />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove step"
                          onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      items: [
                        ...draft.items,
                        { title: "", details: "", category: "other", frequency: "once", times: [], duration_days: 0 },
                      ],
                    })
                  }
                >
                  <Plus /> Add step
                </Button>
              </div>
            </CardContent>
          </Card>

          {draft.safety_notes.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="mb-2 flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4" /> Watch for / confirm with your vet
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {draft.safety_notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            {effectivePetId && repeating > 0 ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={addRoutines} onCheckedChange={(v) => setAddRoutines(Boolean(v))} />
                Also add {repeating} repeating step{repeating === 1 ? "" : "s"} to the Today list
              </label>
            ) : (
              <span className="text-sm text-muted-foreground">Saved checklists can be edited any time.</span>
            )}
            <Button onClick={save} disabled={saving} className="h-10">
              {saving && <Loader2 className="animate-spin" />} Save checklist
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Free-text "08:00, 20:00" field: keeps what you type, parses into HH:MM times on blur. */
function TimesInput({ times, onChange }: { times: string[]; onChange: (times: string[]) => void }) {
  const [text, setText] = useState(times.join(", "));
  return (
    <Input
      value={text}
      placeholder="Times e.g. 08:00, 20:00"
      aria-label="Times"
      className="w-44"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = text
          .split(/[,\s]+/)
          .map((t) => t.trim())
          .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
          .map((t) => t.padStart(5, "0"));
        onChange(parsed);
        setText(parsed.join(", "));
      }}
    />
  );
}

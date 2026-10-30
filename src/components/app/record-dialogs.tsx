"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/app/fields";
import { useSupabase } from "@/hooks/use-supabase";
import { DAY_LABELS, ROUTINE_KINDS, ROUTINE_META } from "@/lib/pet";
import type { Appointment, Pet, Routine, Vaccination } from "@/lib/types";
import { cn } from "@/lib/utils";

interface BaseProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pets: Pet[];
  defaultPetId?: string;
  initial?: T | null;
  onSaved: () => void;
}

function PetPicker({ pets, defaultPetId }: { pets: Pet[]; defaultPetId?: string }) {
  return (
    <Field label="Pet" htmlFor="pet_id">
      <NativeSelect id="pet_id" name="pet_id" defaultValue={defaultPetId ?? pets[0]?.id} required>
        {pets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;

/* ------------------------------------------------------------------------ */
export function RoutineDialog({ open, onOpenChange, pets, defaultPetId, initial, onSaved }: BaseProps<Routine>) {
  const supabase = useSupabase();
  const [busy, setBusy] = useState(false);
  const [times, setTimes] = useState<string[]>(initial?.times ?? ["08:00"]);
  const [days, setDays] = useState<number[]>(initial?.days ?? [0, 1, 2, 3, 4, 5, 6]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!days.length) return toast.error("Pick at least one day");
    const values = {
      pet_id: String(f.get("pet_id")),
      kind: String(f.get("kind")),
      title: String(f.get("title")).trim(),
      times: times.filter(Boolean).sort(),
      days: [...days].sort(),
      amount: text(f, "amount"),
      notes: text(f, "notes"),
    };
    setBusy(true);
    const { error } = initial
      ? await supabase.from("routines").update(values).eq("id", initial.id)
      : await supabase.from("routines").insert(values);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Routine saved");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{initial ? "Edit routine" : "New routine"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <PetPicker pets={pets} defaultPetId={initial?.pet_id ?? defaultPetId} />
          <Field label="Type" htmlFor="kind">
            <NativeSelect id="kind" name="kind" defaultValue={initial?.kind ?? "feeding"}>
              {ROUTINE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ROUTINE_META[k].emoji} {ROUTINE_META[k].label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Title" htmlFor="title" className="sm:col-span-2">
            <Input id="title" name="title" required defaultValue={initial?.title} placeholder="Breakfast" />
          </Field>
          <Field label="Amount / duration" htmlFor="amount">
            <Input id="amount" name="amount" defaultValue={initial?.amount ?? ""} placeholder="1 cup · 30 min · 1 tablet" />
          </Field>
          <Field label="Times">
            <div className="space-y-1.5">
              {times.map((t, i) => (
                <div key={i} className="flex gap-1.5">
                  <Input
                    type="time"
                    value={t}
                    onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove time"
                    onClick={() => setTimes(times.filter((_, j) => j !== i))}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setTimes([...times, "18:00"])}>
                <Plus /> Add time
              </Button>
            </div>
          </Field>
          <Field label="Days" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((d, i) => {
                const on = days.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i])}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Save routine
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
export function VaccineDialog({ open, onOpenChange, pets, defaultPetId, initial, onSaved }: BaseProps<Vaccination>) {
  const supabase = useSupabase();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values = {
      pet_id: String(f.get("pet_id")),
      vaccine: String(f.get("vaccine")).trim(),
      given_on: text(f, "given_on"),
      next_due: text(f, "next_due"),
      clinic: text(f, "clinic"),
      notes: text(f, "notes"),
    };
    setBusy(true);
    const { error } = initial
      ? await supabase.from("vaccinations").update(values).eq("id", initial.id)
      : await supabase.from("vaccinations").insert(values);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Vaccination saved");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{initial ? "Edit vaccination" : "Add vaccination"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <PetPicker pets={pets} defaultPetId={initial?.pet_id ?? defaultPetId} />
          <Field label="Vaccine" htmlFor="vaccine">
            <Input
              id="vaccine"
              name="vaccine"
              required
              list="vaccine-suggestions"
              defaultValue={initial?.vaccine}
              placeholder="Rabies"
            />
            <datalist id="vaccine-suggestions">
              {["Rabies", "DHPP", "Bordetella", "Leptospirosis", "Lyme", "Canine Influenza", "FVRCP", "FeLV"].map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </Field>
          <Field label="Given on" htmlFor="given_on">
            <Input id="given_on" name="given_on" type="date" defaultValue={initial?.given_on ?? ""} />
          </Field>
          <Field label="Next due" htmlFor="next_due">
            <Input id="next_due" name="next_due" type="date" defaultValue={initial?.next_due ?? ""} />
          </Field>
          <Field label="Clinic" htmlFor="clinic" className="sm:col-span-2">
            <Input id="clinic" name="clinic" defaultValue={initial?.clinic ?? ""} />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
export function AppointmentDialog({
  open,
  onOpenChange,
  pets,
  defaultPetId,
  initial,
  onSaved,
}: BaseProps<Appointment>) {
  const supabase = useSupabase();
  const [busy, setBusy] = useState(false);
  const defaultWhen = initial
    ? format(new Date(initial.starts_at), "yyyy-MM-dd'T'HH:mm")
    : format(new Date(Date.now() + 86400000), "yyyy-MM-dd'T'10:00");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values = {
      pet_id: String(f.get("pet_id")),
      kind: String(f.get("kind")),
      title: String(f.get("title")).trim(),
      starts_at: new Date(String(f.get("starts_at"))).toISOString(),
      location: text(f, "location"),
      notes: text(f, "notes"),
    };
    setBusy(true);
    const { error } = initial
      ? await supabase.from("appointments").update(values).eq("id", initial.id)
      : await supabase.from("appointments").insert(values);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Appointment saved");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{initial ? "Edit appointment" : "New appointment"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <PetPicker pets={pets} defaultPetId={initial?.pet_id ?? defaultPetId} />
          <Field label="Type" htmlFor="kind">
            <NativeSelect id="kind" name="kind" defaultValue={initial?.kind ?? "vet"}>
              <option value="vet">🩺 Vet</option>
              <option value="grooming">✂️ Grooming</option>
              <option value="training">🎓 Training</option>
              <option value="other">📌 Other</option>
            </NativeSelect>
          </Field>
          <Field label="Title" htmlFor="title" className="sm:col-span-2">
            <Input id="title" name="title" required defaultValue={initial?.title} placeholder="Annual check-up" />
          </Field>
          <Field label="Date & time" htmlFor="starts_at">
            <Input id="starts_at" name="starts_at" type="datetime-local" required defaultValue={defaultWhen} />
          </Field>
          <Field label="Location" htmlFor="location">
            <Input id="location" name="location" defaultValue={initial?.location ?? ""} placeholder="Happy Paws Clinic" />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

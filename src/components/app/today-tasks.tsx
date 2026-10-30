"use client";

import { Check } from "lucide-react";
import { toast } from "sonner";
import { useSupabase } from "@/hooks/use-supabase";
import { ROUTINE_META, formatTime, todayISO } from "@/lib/pet";
import type { Pet, Routine, RoutineLog } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface Task {
  key: string;
  routine: Routine;
  pet: Pet;
  slot: string; // "HH:MM" or "" for anytime
  done: boolean;
}

export function buildTodayTasks(pets: Pet[], routines: Routine[], logs: RoutineLog[], date = new Date()): Task[] {
  const weekday = date.getDay();
  const today = todayISO(date);
  const petById = new Map(pets.map((p) => [p.id, p]));
  const doneSet = new Set(logs.filter((l) => l.log_date === today).map((l) => `${l.routine_id}|${l.slot}`));
  const tasks: Task[] = [];
  for (const r of routines) {
    const pet = petById.get(r.pet_id);
    if (!pet || !r.active || !r.days.includes(weekday)) continue;
    if (r.ends_on && r.ends_on < today) continue;
    const slots = r.times.length ? r.times : [""];
    for (const slot of slots) {
      tasks.push({ key: `${r.id}|${slot}`, routine: r, pet, slot, done: doneSet.has(`${r.id}|${slot}`) });
    }
  }
  return tasks.sort((a, b) => (a.slot || "99").localeCompare(b.slot || "99"));
}

export function TodayTasks({
  tasks,
  onChange,
  showPet = true,
}: {
  tasks: Task[];
  onChange: (key: string, done: boolean) => void;
  showPet?: boolean;
}) {
  const supabase = useSupabase();
  const nowHHMM = new Date().toTimeString().slice(0, 5);

  async function toggle(task: Task) {
    const next = !task.done;
    onChange(task.key, next); // optimistic
    const today = todayISO();
    const { error } = next
      ? await supabase.from("routine_logs").insert({
          routine_id: task.routine.id,
          pet_id: task.pet.id,
          log_date: today,
          slot: task.slot,
        })
      : await supabase
          .from("routine_logs")
          .delete()
          .eq("routine_id", task.routine.id)
          .eq("log_date", today)
          .eq("slot", task.slot);
    if (error) {
      onChange(task.key, !next);
      toast.error(error.message);
    } else if (next) {
      toast.success(`${ROUTINE_META[task.routine.kind].emoji} ${task.routine.title} done for ${task.pet.name}`);
    }
  }

  return (
    <ul className="space-y-2">
      {tasks.map((t) => {
        const meta = ROUTINE_META[t.routine.kind];
        const overdue = !t.done && t.slot && t.slot < nowHHMM;
        return (
          <li key={t.key}>
            <button
              type="button"
              onClick={() => toggle(t)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-all hover:border-primary/40 hover:shadow-sm",
                t.done && "bg-muted/50"
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                  t.done ? "border-primary bg-primary text-primary-foreground" : "border-input group-hover:border-primary"
                )}
              >
                {t.done && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-base", meta.color)}>
                {meta.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm font-medium", t.done && "text-muted-foreground line-through")}>
                  {t.routine.title}
                  {t.routine.amount && <span className="font-normal text-muted-foreground"> · {t.routine.amount}</span>}
                </span>
                {showPet && <span className="block text-xs text-muted-foreground">{t.pet.name}</span>}
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs tabular-nums text-muted-foreground",
                  overdue && "font-medium text-primary"
                )}
              >
                {t.slot ? formatTime(t.slot) : "Anytime"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

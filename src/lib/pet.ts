import { differenceInMonths, parseISO } from "date-fns";
import type { RoutineKind } from "./types";

export const SPECIES_EMOJI: Record<string, string> = {
  dog: "🐶",
  cat: "🐱",
  bird: "🐦",
  rabbit: "🐰",
  fish: "🐠",
  reptile: "🦎",
  other: "🐾",
};

export const ROUTINE_META: Record<RoutineKind, { label: string; emoji: string; color: string }> = {
  feeding: { label: "Feeding", emoji: "🍖", color: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  walk: { label: "Walk", emoji: "🦮", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  medication: { label: "Medication", emoji: "💊", color: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300" },
  grooming: { label: "Grooming", emoji: "✂️", color: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300" },
  play: { label: "Play", emoji: "🎾", color: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300" },
  training: { label: "Training", emoji: "🎓", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300" },
  other: { label: "Other", emoji: "📌", color: "bg-stone-100 text-stone-800 dark:bg-stone-500/15 dark:text-stone-300" },
};

export const ROUTINE_KINDS = Object.keys(ROUTINE_META) as RoutineKind[];

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function petAge(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const months = differenceInMonths(new Date(), parseISO(birthDate));
  if (months < 0) return null;
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  return `${years} yr${years === 1 ? "" : "s"}`;
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

/** Local date as YYYY-MM-DD (not UTC). */
export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

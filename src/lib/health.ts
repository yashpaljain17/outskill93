import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Vaccination } from "./types";

export function vaccineStatus(v: Pick<Vaccination, "next_due">) {
  if (!v.next_due) return { label: "No due date", tone: "muted" as const, days: null };
  const days = differenceInCalendarDays(parseISO(v.next_due), new Date());
  if (days < 0) return { label: `Overdue by ${-days} day${days === -1 ? "" : "s"}`, tone: "danger" as const, days };
  if (days === 0) return { label: "Due today", tone: "danger" as const, days };
  if (days <= 30) return { label: `Due in ${days} day${days === 1 ? "" : "s"}`, tone: "warn" as const, days };
  return { label: `Due in ${days} days`, tone: "ok" as const, days };
}

export const TONE_CLASS = {
  danger: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  muted: "bg-muted text-muted-foreground",
};

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { ArrowRight, CalendarClock, ClipboardCheck, Loader2, Plus, Sparkles, Syringe } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/fields";
import { PetAvatar } from "@/components/app/pet-avatar";
import { PetFormDialog } from "@/components/app/pet-form-dialog";
import { TodayTasks, buildTodayTasks } from "@/components/app/today-tasks";
import { useSupabase, useUser } from "@/hooks/use-supabase";
import { must, useRows } from "@/hooks/use-rows";
import { petAge, todayISO } from "@/lib/pet";
import { TONE_CLASS, vaccineStatus } from "@/lib/health";
import { createSamplePet } from "@/lib/sample-data";
import type { Appointment, Pet, Routine, RoutineLog, Vaccination } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const supabase = useSupabase();
  const { user } = useUser();
  const [addOpen, setAddOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const { data, loading, reload, setData } = useRows(async () => {
    const [pets, routines, logs, vaccines, appts] = await Promise.all([
      supabase.from("pets").select("*").order("created_at"),
      supabase.from("routines").select("*").eq("active", true),
      supabase.from("routine_logs").select("*").eq("log_date", todayISO()),
      supabase.from("vaccinations").select("*").not("next_due", "is", null).order("next_due"),
      supabase
        .from("appointments")
        .select("*")
        .in("status", ["scheduled", "requested"])
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(6),
    ]);
    return {
      pets: must(pets) as Pet[],
      routines: must(routines) as Routine[],
      logs: must(logs) as RoutineLog[],
      vaccines: must(vaccines) as Vaccination[],
      appts: must(appts) as Appointment[],
    };
  }, []);

  const tasks = useMemo(
    () => (data ? buildTodayTasks(data.pets, data.routines, data.logs) : []),
    [data]
  );
  const doneCount = tasks.filter((t) => t.done).length;
  const petName = (id: string) => data?.pets.find((p) => p.id === id)?.name ?? "";
  const alerts = (data?.vaccines ?? []).filter((v) => (vaccineStatus(v).days ?? 999) <= 30);

  function onTaskChange(key: string, done: boolean) {
    setData((d) => {
      if (!d) return d;
      const [routineId, slot] = key.split("|");
      const logs = done
        ? [...d.logs, { id: key, routine_id: routineId, pet_id: "", log_date: todayISO(), slot, done_at: "" }]
        : d.logs.filter((l) => !(l.routine_id === routineId && l.slot === slot));
      return { ...d, logs };
    });
  }

  async function seed() {
    setSeeding(true);
    try {
      await createSamplePet(supabase);
      toast.success("Meet Bruno! We've added sample routines and records.");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add sample pet");
    } finally {
      setSeeding(false);
    }
  }

  const name = user?.is_anonymous ? "there" : (user?.user_metadata?.display_name ?? "there");
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (loading) return <DashboardSkeleton />;

  if (!data?.pets.length) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-6">
        <h1 className="text-3xl font-bold">
          {greeting}, {name} 👋
        </h1>
        <EmptyState
          emoji="🐾"
          title="Let's add your first pet"
          body="Create a profile, then set up feeding and walk routines, vaccinations and appointments."
        >
          <Button onClick={() => setAddOpen(true)}>
            <Plus /> Add a pet
          </Button>
          <Button variant="outline" onClick={seed} disabled={seeding}>
            {seeding ? <Loader2 className="animate-spin" /> : "🐶"} Load a sample pet
          </Button>
        </EmptyState>
        <PetFormDialog open={addOpen} onOpenChange={setAddOpen} onSaved={() => reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, d MMMM")}</p>
          <h1 className="text-3xl font-bold">
            {greeting}, {name} 👋
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/checklists/new" className={buttonVariants({ variant: "outline" })}>
            <ClipboardCheck /> AI checklist
          </Link>
          <Link href="/assistant" className={buttonVariants()}>
            <Sparkles /> Ask PawPal
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-heading text-xl">Today&apos;s care</CardTitle>
            {tasks.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(doneCount / tasks.length) * 100}%` }}
                  />
                </div>
                {doneCount}/{tasks.length}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {tasks.length ? (
              <TodayTasks tasks={tasks} onChange={onTaskChange} showPet={data.pets.length > 1} />
            ) : (
              <EmptyState emoji="📋" title="Nothing scheduled today" body="Add feeding, walk or medication routines from a pet's page.">
                <Link href={`/pets/${data.pets[0].id}?tab=routines`} className={buttonVariants({ variant: "outline" })}>
                  Add a routine
                </Link>
              </EmptyState>
            )}
            {tasks.length > 0 && doneCount === tasks.length && (
              <p className="mt-4 rounded-xl bg-accent p-3 text-center text-sm font-medium text-accent-foreground">
                🎉 All done for today. Good human!
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-heading text-xl">Your pets</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)}>
                <Plus /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.pets.map((p) => (
                <Link
                  key={p.id}
                  href={`/pets/${p.id}`}
                  className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted"
                >
                  <PetAvatar pet={p} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[p.breed ?? p.species, petAge(p.birth_date), p.weight_kg ? `${p.weight_kg} kg` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-xl">
                <Syringe className="size-5 text-primary" /> Health alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alerts.length === 0 && <p className="text-sm text-muted-foreground">All vaccinations are up to date. ✅</p>}
              {alerts.map((v) => {
                const s = vaccineStatus(v);
                return (
                  <Link
                    key={v.id}
                    href={`/pets/${v.pet_id}?tab=health`}
                    className="flex items-center justify-between gap-2 rounded-xl border p-2.5 text-sm hover:bg-muted"
                  >
                    <span>
                      <span className="font-medium">{v.vaccine}</span>{" "}
                      <span className="text-muted-foreground">· {petName(v.pet_id)}</span>
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TONE_CLASS[s.tone])}>{s.label}</span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-xl">
                <CalendarClock className="size-5 text-primary" /> Coming up
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.appts.length === 0 && <p className="text-sm text-muted-foreground">No upcoming appointments.</p>}
              {data.appts.map((a) => (
                <Link
                  key={a.id}
                  href={`/pets/${a.pet_id}?tab=appointments`}
                  className="flex items-center gap-3 rounded-xl border p-2.5 text-sm hover:bg-muted"
                >
                  <span className="grid w-11 shrink-0 place-items-center rounded-lg bg-secondary py-1 text-center leading-tight">
                    <span className="text-[10px] uppercase text-muted-foreground">{format(new Date(a.starts_at), "MMM")}</span>
                    <span className="font-heading text-lg font-semibold">{format(new Date(a.starts_at), "d")}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {a.status === "requested" && (
                        <span className="mr-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                          Awaiting clinic
                        </span>
                      )}
                      {a.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {petName(a.pet_id)} · {format(new Date(a.starts_at), "EEE h:mm a")} ·{" "}
                      {formatDistanceToNowStrict(new Date(a.starts_at), { addSuffix: true })}
                    </span>
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <PetFormDialog open={addOpen} onOpenChange={setAddOpen} onSaved={() => reload()} />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-96 rounded-2xl" />
        <div className="space-y-6">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

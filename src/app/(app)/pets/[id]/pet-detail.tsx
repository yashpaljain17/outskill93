"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, CalendarPlus, ClipboardCheck, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/fields";
import { PetAvatar } from "@/components/app/pet-avatar";
import { PetFormDialog } from "@/components/app/pet-form-dialog";
import { AppointmentDialog, RoutineDialog, VaccineDialog } from "@/components/app/record-dialogs";
import { TodayTasks, buildTodayTasks } from "@/components/app/today-tasks";
import { useSupabase } from "@/hooks/use-supabase";
import { must, useRows } from "@/hooks/use-rows";
import { DAY_LABELS, ROUTINE_META, formatTime, petAge, todayISO } from "@/lib/pet";
import { TONE_CLASS, vaccineStatus } from "@/lib/health";
import type { Appointment, Checklist, Pet, Routine, RoutineLog, Vaccination } from "@/lib/types";
import { cn } from "@/lib/utils";

type DialogState =
  | { kind: "pet" }
  | { kind: "routine"; item?: Routine }
  | { kind: "vaccine"; item?: Vaccination }
  | { kind: "appointment"; item?: Appointment }
  | null;

export function PetDetail({ id, initialTab }: { id: string; initialTab: string }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [dialog, setDialog] = useState<DialogState>(null);

  const { data, loading, reload, setData } = useRows(async () => {
    const [pet, routines, logs, vaccines, appts, checklists] = await Promise.all([
      supabase.from("pets").select("*").eq("id", id).maybeSingle(),
      supabase.from("routines").select("*").eq("pet_id", id).order("created_at"),
      supabase.from("routine_logs").select("*").eq("pet_id", id).eq("log_date", todayISO()),
      supabase.from("vaccinations").select("*").eq("pet_id", id).order("next_due", { nullsFirst: false }),
      supabase.from("appointments").select("*").eq("pet_id", id).order("starts_at", { ascending: false }),
      supabase.from("checklists").select("*, checklist_items(done)").eq("pet_id", id).order("created_at", { ascending: false }),
    ]);
    return {
      pet: must(pet) as Pet | null,
      routines: must(routines) as Routine[],
      logs: must(logs) as RoutineLog[],
      vaccines: must(vaccines) as Vaccination[],
      appts: must(appts) as Appointment[],
      checklists: must(checklists) as (Checklist & { checklist_items: { done: boolean }[] })[],
    };
  }, [id]);

  const tasks = useMemo(
    () => (data?.pet ? buildTodayTasks([data.pet], data.routines, data.logs) : []),
    [data]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }
  if (!data?.pet) {
    return (
      <EmptyState emoji="🔍" title="Pet not found">
        <Link href="/pets" className={buttonVariants()}>
          Back to pets
        </Link>
      </EmptyState>
    );
  }

  const { pet } = data;
  const pets = [pet];
  const now = new Date().toISOString();
  const isOpen = (a: Appointment) => ["scheduled", "requested", "options"].includes(a.status);
  const upcoming = data.appts.filter((a) => a.starts_at >= now && isOpen(a)).reverse();
  const past = data.appts.filter((a) => a.starts_at < now || !isOpen(a));

  async function remove(table: string, rowId: string, label: string) {
    if (!confirm(`Delete this ${label}?`)) return;
    const { error } = await supabase.from(table).delete().eq("id", rowId);
    if (error) return toast.error(error.message);
    toast.success(`${label[0].toUpperCase()}${label.slice(1)} deleted`);
    reload();
  }

  async function deletePet() {
    if (!confirm(`Delete ${pet.name} and all their records? This can't be undone.`)) return;
    const { error } = await supabase.from("pets").delete().eq("id", pet.id);
    if (error) return toast.error(error.message);
    toast.success(`${pet.name} removed`);
    router.push("/pets");
  }

  async function toggleRoutine(r: Routine, active: boolean) {
    setData((d) => d && { ...d, routines: d.routines.map((x) => (x.id === r.id ? { ...x, active } : x)) });
    const { error } = await supabase.from("routines").update({ active }).eq("id", r.id);
    if (error) {
      toast.error(error.message);
      reload();
    }
  }

  async function markAppt(a: Appointment, status: Appointment["status"]) {
    const { error } = await supabase.from("appointments").update({ status }).eq("id", a.id);
    if (error) return toast.error(error.message);
    reload();
  }

  return (
    <div className="space-y-6">
      <Link href="/pets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All pets
      </Link>

      <div className="flex flex-wrap items-center gap-4 rounded-3xl border bg-card p-5 shadow-sm">
        <PetAvatar pet={pet} className="size-20 rounded-3xl text-4xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold">{pet.name}</h1>
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {[pet.breed ?? pet.species, pet.sex, petAge(pet.birth_date), pet.weight_kg ? `${pet.weight_kg} kg` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {pet.allergies && (
            <p className="mt-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-800 dark:bg-rose-500/15 dark:text-rose-300">
              Allergies: {pet.allergies}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/assistant?pet=${pet.id}`} className={buttonVariants({ variant: "outline" })}>
            <Sparkles /> Ask about {pet.name}
          </Link>
          <Button variant="ghost" size="icon" aria-label="Edit pet" onClick={() => setDialog({ kind: "pet" })}>
            <Pencil />
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="routines">Routines</TabsTrigger>
          <TabsTrigger value="health">Vaccinations</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="checklists">Checklists</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-xl">Today</CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length ? (
                <TodayTasks
                  tasks={tasks}
                  showPet={false}
                  onChange={(key, done) =>
                    setData((d) => {
                      if (!d) return d;
                      const [routineId, slot] = key.split("|");
                      const logs = done
                        ? [...d.logs, { id: key, routine_id: routineId, pet_id: id, log_date: todayISO(), slot, done_at: "" }]
                        : d.logs.filter((l) => !(l.routine_id === routineId && l.slot === slot));
                      return { ...d, logs };
                    })
                  }
                />
              ) : (
                <EmptyState emoji="📋" title="No routines today">
                  <Button variant="outline" onClick={() => setDialog({ kind: "routine" })}>
                    <Plus /> Add routine
                  </Button>
                </EmptyState>
              )}
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-xl">About</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Birthday" value={pet.birth_date ? format(new Date(pet.birth_date + "T00:00"), "d MMM yyyy") : "—"} />
                <Row label="Weight" value={pet.weight_kg ? `${pet.weight_kg} kg` : "—"} />
                <Row label="Allergies" value={pet.allergies ?? "None recorded"} />
                {pet.notes && <p className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-muted-foreground">{pet.notes}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-xl">Quick add</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setDialog({ kind: "routine" })}>
                  <Plus /> Routine
                </Button>
                <Button variant="outline" onClick={() => setDialog({ kind: "vaccine" })}>
                  <Plus /> Vaccine
                </Button>
                <Button variant="outline" onClick={() => setDialog({ kind: "appointment" })}>
                  <CalendarPlus /> Appointment
                </Button>
                <Link href={`/checklists/new?pet=${pet.id}`} className={buttonVariants({ variant: "outline" })}>
                  <ClipboardCheck /> AI checklist
                </Link>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Routines */}
        <TabsContent value="routines" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setDialog({ kind: "routine" })}>
              <Plus /> New routine
            </Button>
          </div>
          {data.routines.length === 0 && (
            <EmptyState emoji="🍖" title="No routines yet" body="Add feeding times, walks, medications or grooming." />
          )}
          {data.routines.map((r) => {
            const meta = ROUTINE_META[r.kind];
            return (
              <div key={r.id} className={cn("flex items-center gap-3 rounded-2xl border bg-card p-4", !r.active && "opacity-60")}>
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-lg", meta.color)}>{meta.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {r.title}
                    {r.amount && <span className="font-normal text-muted-foreground"> · {r.amount}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.times.length ? r.times.map(formatTime).join(", ") : "Anytime"} ·{" "}
                    {r.days.length === 7 ? "Every day" : r.days.map((d) => DAY_LABELS[d]).join(", ")}
                    {r.ends_on && ` · until ${format(new Date(r.ends_on + "T00:00"), "d MMM")}`}
                  </p>
                  {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
                </div>
                <Switch checked={r.active} onCheckedChange={(v) => toggleRoutine(r, v)} aria-label="Active" />
                <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setDialog({ kind: "routine", item: r })}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove("routines", r.id, "routine")}>
                  <Trash2 />
                </Button>
              </div>
            );
          })}
        </TabsContent>

        {/* Vaccinations */}
        <TabsContent value="health" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setDialog({ kind: "vaccine" })}>
              <Plus /> Add vaccination
            </Button>
          </div>
          {data.vaccines.length === 0 && (
            <EmptyState emoji="💉" title="No vaccination records" body="Keep track of shots and get reminded before boosters are due." />
          )}
          {data.vaccines.map((v) => {
            const s = vaccineStatus(v);
            return (
              <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-lg">💉</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{v.vaccine}</p>
                  <p className="text-xs text-muted-foreground">
                    Given {v.given_on ? format(new Date(v.given_on + "T00:00"), "d MMM yyyy") : "—"}
                    {v.next_due && ` · Next due ${format(new Date(v.next_due + "T00:00"), "d MMM yyyy")}`}
                    {v.clinic && ` · ${v.clinic}`}
                  </p>
                </div>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", TONE_CLASS[s.tone])}>{s.label}</span>
                <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setDialog({ kind: "vaccine", item: v })}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove("vaccinations", v.id, "vaccination")}>
                  <Trash2 />
                </Button>
              </div>
            );
          })}
        </TabsContent>

        {/* Appointments */}
        <TabsContent value="appointments" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setDialog({ kind: "appointment" })}>
              <CalendarPlus /> New appointment
            </Button>
          </div>
          {data.appts.length === 0 && (
            <EmptyState emoji="🩺" title="No appointments" body="Schedule vet visits and grooming sessions." />
          )}
          {upcoming.length > 0 && <h3 className="text-sm font-semibold text-muted-foreground">Upcoming</h3>}
          {upcoming.map((a) => (
            <ApptRow
              key={a.id}
              a={a}
              onEdit={() => setDialog({ kind: "appointment", item: a })}
              onDelete={() => remove("appointments", a.id, "appointment")}
              onDone={() => markAppt(a, "done")}
            />
          ))}
          {past.length > 0 && <h3 className="pt-2 text-sm font-semibold text-muted-foreground">Past & cancelled</h3>}
          {past.map((a) => (
            <ApptRow
              key={a.id}
              a={a}
              muted
              onEdit={() => setDialog({ kind: "appointment", item: a })}
              onDelete={() => remove("appointments", a.id, "appointment")}
            />
          ))}
        </TabsContent>

        {/* Checklists */}
        <TabsContent value="checklists" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Link href={`/checklists/new?pet=${pet.id}`} className={buttonVariants()}>
              <Sparkles /> New AI checklist
            </Link>
          </div>
          {data.checklists.length === 0 && (
            <EmptyState
              emoji="✨"
              title="No checklists yet"
              body="Paste care instructions from your vet and PawPal turns them into an editable checklist."
            />
          )}
          {data.checklists.map((c) => {
            const done = c.checklist_items.filter((i) => i.done).length;
            return (
              <Link
                key={c.id}
                href={`/checklists/${c.id}`}
                className="flex items-center gap-3 rounded-2xl border bg-card p-4 hover:bg-muted"
              >
                <ClipboardCheck className="size-5 text-primary" />
                <span className="flex-1 font-medium">{c.title}</span>
                <span className="text-xs text-muted-foreground">
                  {done}/{c.checklist_items.length} done
                </span>
              </Link>
            );
          })}
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button variant="destructive" onClick={deletePet}>
          <Trash2 /> Delete {pet.name}
        </Button>
      </div>

      {dialog?.kind === "pet" && (
        <PetFormDialog open onOpenChange={() => setDialog(null)} pet={pet} onSaved={() => reload()} />
      )}
      {dialog?.kind === "routine" && (
        <RoutineDialog open onOpenChange={() => setDialog(null)} pets={pets} defaultPetId={pet.id} initial={dialog.item} onSaved={reload} />
      )}
      {dialog?.kind === "vaccine" && (
        <VaccineDialog open onOpenChange={() => setDialog(null)} pets={pets} defaultPetId={pet.id} initial={dialog.item} onSaved={reload} />
      )}
      {dialog?.kind === "appointment" && (
        <AppointmentDialog
          open
          onOpenChange={() => setDialog(null)}
          pets={pets}
          defaultPetId={pet.id}
          initial={dialog.item}
          onSaved={reload}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function ApptRow({
  a,
  muted,
  onEdit,
  onDelete,
  onDone,
}: {
  a: Appointment;
  muted?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDone?: () => void;
}) {
  const icon = { vet: "🩺", grooming: "✂️", training: "🎓", other: "📌" }[a.kind];
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4", muted && "opacity-70")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-lg">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {a.title}
          {a.status !== "scheduled" && (
            <span
              className={cn(
                "ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal capitalize",
                (a.status === "requested" || a.status === "options") && "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              )}
            >
              {a.status === "requested" ? "Awaiting clinic" : a.status === "options" ? "Pick a time on Today" : a.status}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(a.starts_at), "EEE d MMM yyyy, h:mm a")}
          {a.location && ` · ${a.location}`}
        </p>
        {a.notes && <p className="mt-1 text-xs text-muted-foreground">{a.notes}</p>}
      </div>
      {onDone && (
        <Button variant="outline" size="sm" onClick={onDone}>
          Mark done
        </Button>
      )}
      <Button variant="ghost" size="icon" aria-label="Edit" onClick={onEdit}>
        <Pencil />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Delete" onClick={onDelete}>
        <Trash2 />
      </Button>
    </div>
  );
}

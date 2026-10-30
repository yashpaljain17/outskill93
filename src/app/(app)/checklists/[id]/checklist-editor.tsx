"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/fields";
import { useSupabase } from "@/hooks/use-supabase";
import { must, useRows } from "@/hooks/use-rows";
import type { Checklist, ChecklistItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type Data = Checklist & { checklist_items: ChecklistItem[]; pets: { id: string; name: string } | null };

export function ChecklistEditor({ id }: { id: string }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [showSource, setShowSource] = useState(false);

  const { data, loading, setData, reload } = useRows(async () => {
    const row = must(
      await supabase.from("checklists").select("*, checklist_items(*), pets(id, name)").eq("id", id).maybeSingle()
    ) as Data | null;
    row?.checklist_items.sort((a, b) => a.position - b.position);
    return row;
  }, [id]);

  if (loading) return <Skeleton className="mx-auto h-96 max-w-3xl rounded-2xl" />;
  if (!data)
    return (
      <EmptyState emoji="🔍" title="Checklist not found">
        <Link href="/checklists" className={buttonVariants()}>
          Back to checklists
        </Link>
      </EmptyState>
    );

  const items = data.checklist_items;
  const done = items.filter((i) => i.done).length;

  function patchLocal(itemId: string, patch: Partial<ChecklistItem>) {
    setData((d) => d && { ...d, checklist_items: d.checklist_items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
  }

  async function updateItem(itemId: string, patch: Partial<ChecklistItem>) {
    patchLocal(itemId, patch);
    const { error } = await supabase.from("checklist_items").update(patch).eq("id", itemId);
    if (error) {
      toast.error(error.message);
      reload();
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const { data: row, error } = await supabase
      .from("checklist_items")
      .insert({ checklist_id: id, title, position: (items.at(-1)?.position ?? -1) + 1 })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setNewTitle("");
    setData((d) => d && { ...d, checklist_items: [...d.checklist_items, row as ChecklistItem] });
  }

  async function deleteItem(itemId: string) {
    setData((d) => d && { ...d, checklist_items: d.checklist_items.filter((i) => i.id !== itemId) });
    const { error } = await supabase.from("checklist_items").delete().eq("id", itemId);
    if (error) {
      toast.error(error.message);
      reload();
    }
  }

  async function resetAll() {
    setData((d) => d && { ...d, checklist_items: d.checklist_items.map((i) => ({ ...i, done: false })) });
    await supabase.from("checklist_items").update({ done: false }).eq("checklist_id", id);
  }

  async function deleteChecklist() {
    if (!confirm("Delete this checklist?")) return;
    const { error } = await supabase.from("checklists").delete().eq("id", id);
    if (error) return toast.error(error.message);
    router.push("/checklists");
  }

  async function renameChecklist(title: string) {
    if (!title.trim() || title === data!.title) return;
    setData((d) => d && { ...d, title });
    await supabase.from("checklists").update({ title }).eq("id", id);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/checklists" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All checklists
      </Link>

      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <input
          defaultValue={data.title}
          onBlur={(e) => renameChecklist(e.target.value)}
          aria-label="Checklist title"
          className="w-full bg-transparent font-heading text-2xl font-bold outline-none focus:underline sm:text-3xl"
        />
        <p className="mt-1 text-sm text-muted-foreground">
          {data.pets && (
            <>
              For{" "}
              <Link href={`/pets/${data.pets.id}`} className="font-medium text-foreground hover:underline">
                {data.pets.name}
              </Link>{" "}
              ·{" "}
            </>
          )}
          Created {format(new Date(data.created_at), "d MMM yyyy")}
        </p>
        {data.summary && <p className="mt-3 text-sm">{data.summary}</p>}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">
            {done}/{items.length}
          </span>
          {done > 0 && (
            <Button variant="ghost" size="sm" onClick={resetAll}>
              <RotateCcw /> Reset
            </Button>
          )}
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className={cn("rounded-2xl border bg-card p-3 transition-colors", item.done && "bg-muted/50")}>
            {editing === item.id ? (
              <EditItem
                item={item}
                onCancel={() => setEditing(null)}
                onSave={(patch) => {
                  setEditing(null);
                  updateItem(item.id, patch);
                }}
              />
            ) : (
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-label={item.done ? "Mark not done" : "Mark done"}
                  onClick={() => updateItem(item.id, { done: !item.done })}
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                    item.done ? "border-primary bg-primary text-primary-foreground" : "border-input hover:border-primary"
                  )}
                >
                  {item.done && <Check className="size-3.5" strokeWidth={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn("font-medium", item.done && "text-muted-foreground line-through")}>{item.title}</p>
                  {item.details && <p className="mt-0.5 text-sm text-muted-foreground">{item.details}</p>}
                  {(item.frequency || item.time_of_day || item.category) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                      {item.frequency && <span className="rounded-full bg-secondary px-2 py-0.5">{item.frequency}</span>}
                      {item.time_of_day && <span className="rounded-full bg-secondary px-2 py-0.5">{item.time_of_day}</span>}
                      {item.category && <span className="rounded-full bg-accent px-2 py-0.5 capitalize text-accent-foreground">{item.category}</span>}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Edit step" onClick={() => setEditing(item.id)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Delete step" onClick={() => deleteItem(item.id)}>
                  <Trash2 />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={addItem} className="flex gap-2">
        <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Add a step…" />
        <Button type="submit" variant="outline">
          <Plus /> Add
        </Button>
      </form>

      {data.safety_notes.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" /> Watch for / confirm with your vet
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {data.safety_notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {data.source_text && (
        <div className="rounded-2xl border bg-card">
          <button
            type="button"
            onClick={() => setShowSource(!showSource)}
            className="flex w-full items-center justify-between p-4 text-sm font-medium"
          >
            Original instructions
            <ChevronDown className={cn("size-4 transition-transform", showSource && "rotate-180")} />
          </button>
          {showSource && <p className="whitespace-pre-wrap px-4 pb-4 text-sm text-muted-foreground">{data.source_text}</p>}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="destructive" onClick={deleteChecklist}>
          <Trash2 /> Delete checklist
        </Button>
      </div>
    </div>
  );
}

function EditItem({
  item,
  onSave,
  onCancel,
}: {
  item: ChecklistItem;
  onSave: (patch: Partial<ChecklistItem>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [details, setDetails] = useState(item.details ?? "");
  const [frequency, setFrequency] = useState(item.frequency ?? "");
  const [timeOfDay, setTimeOfDay] = useState(item.time_of_day ?? "");
  return (
    <div className="space-y-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Details" rows={2} />
      <div className="flex flex-wrap gap-2">
        <Input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="Frequency" className="w-36" />
        <Input value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} placeholder="When" className="w-48" />
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X /> Cancel
          </Button>
          <Button
            size="sm"
            disabled={!title.trim()}
            onClick={() =>
              onSave({
                title: title.trim(),
                details: details.trim() || null,
                frequency: frequency.trim() || null,
                time_of_day: timeOfDay.trim() || null,
              })
            }
          >
            <Check /> Save
          </Button>
        </div>
      </div>
    </div>
  );
}

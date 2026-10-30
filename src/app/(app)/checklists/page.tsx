"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ClipboardCheck, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/fields";
import { useSupabase } from "@/hooks/use-supabase";
import { must, useRows } from "@/hooks/use-rows";
import type { Checklist } from "@/lib/types";

type Row = Checklist & { checklist_items: { done: boolean }[]; pets: { name: string } | null };

export default function ChecklistsPage() {
  const supabase = useSupabase();
  const { data, loading } = useRows(
    async () =>
      must(
        await supabase
          .from("checklists")
          .select("*, checklist_items(done), pets(name)")
          .order("created_at", { ascending: false })
      ) as Row[],
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Care checklists</h1>
          <p className="text-muted-foreground">Turn any care instructions into steps you can tick off.</p>
        </div>
        <Link href="/checklists/new" className={buttonVariants()}>
          <Sparkles /> New with AI
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : !data?.length ? (
        <EmptyState
          emoji="✨"
          title="No checklists yet"
          body="Paste your vet's discharge notes, a feeding plan or training tips, and PawPal will turn them into an editable checklist."
        >
          <Link href="/checklists/new" className={buttonVariants()}>
            <Sparkles /> Create your first
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((c) => {
            const total = c.checklist_items.length;
            const done = c.checklist_items.filter((i) => i.done).length;
            return (
              <Link
                key={c.id}
                href={`/checklists/${c.id}`}
                className="rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                    <ClipboardCheck className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-lg font-semibold leading-snug">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.pets?.name ? `${c.pets.name} · ` : ""}
                      {format(new Date(c.created_at), "d MMM yyyy")}
                    </p>
                  </div>
                </div>
                {c.summary && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{c.summary}</p>}
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                  </div>
                  {done}/{total}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

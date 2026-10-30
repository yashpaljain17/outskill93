"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Loader2, MessageCircle, Plus, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, NativeSelect } from "@/components/app/fields";
import { useSupabase, useUser } from "@/hooks/use-supabase";
import { must, useRows } from "@/hooks/use-rows";
import { SPECIES_EMOJI } from "@/lib/pet";
import type { Question } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS = ["all", "dog", "cat", "bird", "rabbit", "other"];

export default function CommunityPage() {
  const supabase = useSupabase();
  const { user } = useUser();
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [askOpen, setAskOpen] = useState(false);

  const { data, loading, error, reload } = useRows(
    async () =>
      must(
        await supabase
          .from("questions")
          .select("*, profiles!questions_author_id_fkey(display_name), answers!answers_question_id_fkey(count)")
          .order("created_at", { ascending: false })
          .limit(100)
      ) as Question[],
    []
  );

  useEffect(() => {
    const channel = supabase
      .channel("community-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "questions" }, () => reload())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers" }, () => reload())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, reload]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (x) =>
        (filter === "all" || x.species === filter || (filter === "other" && !["dog", "cat", "bird", "rabbit"].includes(x.species ?? ""))) &&
        (!q || x.title.toLowerCase().includes(q) || x.body.toLowerCase().includes(q) || x.tags.some((t) => t.includes(q)))
    );
  }, [data, filter, query]);

  function ask() {
    if (!user) return router.push("/login?next=/community");
    setAskOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Community</h1>
          <p className="text-muted-foreground">Ask fellow pet owners, share what worked for you.</p>
        </div>
        <Button onClick={ask}>
          <Plus /> Ask a question
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions" className="pl-8" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
              )}
            >
              {f === "all" ? "All" : `${SPECIES_EMOJI[f]} ${f}`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState emoji="⚠️" title="Couldn't load questions" body={error}>
          <Button variant="outline" onClick={() => reload()}>
            Try again
          </Button>
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState emoji="💬" title="No questions yet" body="Be the first to ask, and get an instant AI suggestion while the community weighs in.">
          <Button onClick={ask}>
            <Plus /> Ask a question
          </Button>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {shown.map((q) => {
            const count = q.answers?.[0]?.count ?? 0;
            return (
              <li key={q.id}>
                <Link
                  href={`/community/${q.id}`}
                  className="block rounded-2xl border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-xl">
                      {SPECIES_EMOJI[q.species ?? "other"] ?? "🐾"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{q.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{q.body}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{q.profiles?.display_name ?? "Pet owner"}</span>
                        <span>{formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}</span>
                        <span className={cn("inline-flex items-center gap-1", q.accepted_answer_id && "text-emerald-600 dark:text-emerald-400")}>
                          <MessageCircle className="size-3.5" /> {count} answer{count === 1 ? "" : "s"}
                          {q.accepted_answer_id && " · solved"}
                        </span>
                        {q.ai_answer && (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <Sparkles className="size-3.5" /> AI suggestion
                          </span>
                        )}
                        {q.tags.map((t) => (
                          <span key={t} className="rounded-full bg-secondary px-2 py-0.5">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {askOpen && <AskDialog onClose={() => setAskOpen(false)} />}
    </div>
  );
}

function AskDialog({ onClose }: { onClose: () => void }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const tags = String(f.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
      .filter(Boolean)
      .slice(0, 5);
    setBusy(true);
    const { data, error } = await supabase
      .from("questions")
      .insert({
        title: String(f.get("title")).trim(),
        body: String(f.get("body")).trim(),
        species: String(f.get("species")) || null,
        tags,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) return toast.error(error?.message ?? "Could not post");
    toast.success("Question posted!");
    // Kick off the AI suggestion; the question page shows it when ready.
    void fetch("/api/ai/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: data.id }),
    });
    router.push(`/community/${data.id}?new=1`);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Ask the community</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Question" htmlFor="title">
            <Input id="title" name="title" required maxLength={160} placeholder="How do I stop my puppy biting during play?" />
          </Field>
          <Field label="Details" htmlFor="body">
            <Textarea id="body" name="body" required rows={5} placeholder="Age, breed, what you've tried so far…" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pet type" htmlFor="species">
              <NativeSelect id="species" name="species" defaultValue="dog">
                <option value="dog">Dog</option>
                <option value="cat">Cat</option>
                <option value="bird">Bird</option>
                <option value="rabbit">Rabbit</option>
                <option value="fish">Fish</option>
                <option value="reptile">Reptile</option>
                <option value="other">Other</option>
              </NativeSelect>
            </Field>
            <Field label="Tags" htmlFor="tags" hint="Comma separated">
              <Input id="tags" name="tags" placeholder="training, puppy" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Post question
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

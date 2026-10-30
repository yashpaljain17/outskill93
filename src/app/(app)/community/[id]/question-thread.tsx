"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Sparkles, ThumbsUp, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/fields";
import { Markdown } from "@/components/app/markdown";
import { useSupabase, useUser } from "@/hooks/use-supabase";
import { must, useRows } from "@/hooks/use-rows";
import { SPECIES_EMOJI } from "@/lib/pet";
import type { Answer, Question } from "@/lib/types";
import { cn } from "@/lib/utils";

export function QuestionThread({ id }: { id: string }) {
  const supabase = useSupabase();
  const { user } = useUser();
  const params = useSearchParams();
  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);
  const [aiLoading, setAiLoading] = useState(params.get("new") === "1");

  const { data, loading, error, reload, setData } = useRows(async () => {
    const [q, answers] = await Promise.all([
      supabase.from("questions").select("*, profiles!questions_author_id_fkey(display_name)").eq("id", id).maybeSingle(),
      supabase
        .from("answers")
        .select("*, profiles!answers_author_id_fkey(display_name), answer_votes(user_id)")
        .eq("question_id", id)
        .order("created_at"),
    ]);
    return { q: must(q) as Question | null, answers: must(answers) as Answer[] };
  }, [id]);

  useEffect(() => {
    const channel = supabase
      .channel(`question-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "answers", filter: `question_id=eq.${id}` }, () => reload())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "questions", filter: `id=eq.${id}` }, () => reload())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, id, reload]);

  // While a freshly posted question waits for its AI suggestion, poll briefly (realtime also covers it).
  const aiPending = aiLoading && !data?.q?.ai_answer;
  useEffect(() => {
    if (!aiPending) return;
    const t = setTimeout(() => {
      reload();
    }, 3000);
    const stop = setTimeout(() => setAiLoading(false), 60000);
    return () => {
      clearTimeout(t);
      clearTimeout(stop);
    };
  }, [aiPending, data, reload]);

  if (loading) return <Skeleton className="mx-auto h-96 max-w-3xl rounded-2xl" />;
  if (error && !data)
    return (
      <EmptyState emoji="⚠️" title="Couldn't load this question" body={error}>
        <Button onClick={() => reload()}>Try again</Button>
      </EmptyState>
    );
  if (!data?.q)
    return (
      <EmptyState emoji="🔍" title="Question not found">
        <Link href="/community" className={buttonVariants()}>
          Back to community
        </Link>
      </EmptyState>
    );

  const { q, answers } = data;
  const isAuthor = user?.id === q.author_id;
  const sorted = [...answers].sort((a, b) => {
    if (a.id === q.accepted_answer_id) return -1;
    if (b.id === q.accepted_answer_id) return 1;
    return (b.answer_votes?.length ?? 0) - (a.answer_votes?.length ?? 0);
  });

  async function requestAi() {
    setAiLoading(true);
    const res = await fetch("/api/ai/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: id }),
    });
    const body = await res.json().catch(() => ({}));
    setAiLoading(false);
    if (!res.ok) return toast.error(body.error ?? "AI suggestion failed");
    setData((d) => d && d.q && { ...d, q: { ...d.q, ai_answer: body.answer } });
  }

  async function postAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setPosting(true);
    const { error } = await supabase.from("answers").insert({ question_id: id, body: reply.trim() });
    setPosting(false);
    if (error) return toast.error(error.message);
    setReply("");
    reload();
  }

  async function toggleVote(a: Answer) {
    if (!user) return toast.error("Sign in to vote");
    const voted = a.answer_votes?.some((v) => v.user_id === user.id);
    const { error } = voted
      ? await supabase.from("answer_votes").delete().eq("answer_id", a.id).eq("user_id", user.id)
      : await supabase.from("answer_votes").insert({ answer_id: a.id });
    if (error) return toast.error(error.message);
    reload();
  }

  async function accept(a: Answer) {
    const next = q.accepted_answer_id === a.id ? null : a.id;
    const { error } = await supabase.from("questions").update({ accepted_answer_id: next }).eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  }

  async function deleteAnswer(a: Answer) {
    if (!confirm("Delete your answer?")) return;
    const { error } = await supabase.from("answers").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    reload();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/community" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Community
      </Link>

      <article className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-2xl">
            {SPECIES_EMOJI[q.species ?? "other"] ?? "🐾"}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{q.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {q.profiles?.display_name ?? "Pet owner"} · {formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{q.body}</p>
        {q.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            {q.tags.map((t) => (
              <span key={t} className="rounded-full bg-secondary px-2 py-0.5">
                #{t}
              </span>
            ))}
          </div>
        )}
      </article>

      <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
          <Sparkles className="size-4" /> AI suggestion
        </p>
        {q.ai_answer ? (
          <>
            <Markdown text={q.ai_answer} />
            <p className="mt-3 text-xs text-muted-foreground">
              Generated by AI as a starting point. Community answers and your vet know your pet best.
            </p>
          </>
        ) : aiPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Thinking about this one…
          </p>
        ) : isAuthor ? (
          <Button size="sm" variant="outline" onClick={requestAi}>
            <Sparkles /> Get an AI suggestion
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">No AI suggestion for this question.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {answers.length} answer{answers.length === 1 ? "" : "s"}
        </h2>
        {sorted.map((a) => {
          const votes = a.answer_votes?.length ?? 0;
          const voted = Boolean(user && a.answer_votes?.some((v) => v.user_id === user.id));
          const accepted = a.id === q.accepted_answer_id;
          return (
            <div
              key={a.id}
              className={cn(
                "flex gap-3 rounded-2xl border bg-card p-4",
                accepted && "border-emerald-400 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/10"
              )}
            >
              <button
                type="button"
                onClick={() => toggleVote(a)}
                aria-pressed={voted}
                aria-label="Upvote"
                className={cn(
                  "flex h-fit flex-col items-center rounded-xl border px-2 py-1.5 text-xs font-semibold tabular-nums transition-colors",
                  voted ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                <ThumbsUp className="size-4" />
                {votes}
              </button>
              <div className="min-w-0 flex-1">
                {accepted && (
                  <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" /> Accepted answer
                  </p>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {a.profiles?.display_name ?? "Pet owner"} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </span>
                  {isAuthor && (
                    <button type="button" className="font-medium text-primary hover:underline" onClick={() => accept(a)}>
                      {accepted ? "Unaccept" : "Accept answer"}
                    </button>
                  )}
                  {user?.id === a.author_id && (
                    <button type="button" className="inline-flex items-center gap-1 hover:text-destructive" onClick={() => deleteAnswer(a)}>
                      <Trash2 className="size-3" /> Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {user ? (
        <form onSubmit={postAnswer} className="space-y-2 rounded-2xl border bg-card p-4">
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Share what worked for you…" rows={4} />
          <div className="flex justify-end">
            <Button type="submit" disabled={posting || !reply.trim()}>
              {posting && <Loader2 className="animate-spin" />} Post answer
            </Button>
          </div>
        </form>
      ) : (
        <div className="rounded-2xl border bg-card p-4 text-center text-sm">
          <Link href={`/login?next=/community/${id}`} className="font-medium text-primary hover:underline">
            Sign in
          </Link>{" "}
          to answer and vote.
        </div>
      )}
    </div>
  );
}

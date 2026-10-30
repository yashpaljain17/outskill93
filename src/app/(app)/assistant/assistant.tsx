"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, AudioLines, Check, Loader2, Mic, Sparkles, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/app/fields";
import { Markdown } from "@/components/app/markdown";
import { PawIcon } from "@/components/app/logo";
import { useSupabase } from "@/hooks/use-supabase";
import { must, useRows } from "@/hooks/use-rows";
import { useVoice } from "@/hooks/use-voice";
import type { Appointment, Pet } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: { label: string; href: string }[];
  status?: string;
  error?: boolean;
}

const SUGGESTIONS = [
  "What's on today's schedule?",
  "Is any vaccination due soon?",
  "Add an evening walk at 7pm every day",
  "Can dogs eat grapes?",
  "Book Bruno's vaccination at the Indiranagar clinic tomorrow morning",
  "Tips for brushing a cat that hates it",
];

type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

export function Assistant() {
  const supabase = useSupabase();
  const params = useSearchParams();
  const [petId, setPetId] = useState<string>(params.get("pet") ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [lastHeard, setLastHeard] = useState("");
  const messagesRef = useRef<ChatMessage[]>([]);
  const voiceModeRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const voice = useVoice();
  const phaseRef = useRef<VoicePhase>("idle");
  /** Booking id -> last status seen, for bookings the booking workflow is still working on. */
  const watchedRef = useRef(new Map<string, string>());
  const [watchCount, setWatchCount] = useState(0);
  /** Announcements waiting to be spoken in voice mode. */
  const spokenQueueRef = useRef<string[]>([]);
  /** While a reply streams in, booking updates wait here so they don't mix into it. */
  const streamingRef = useRef(false);
  const heldRef = useRef<{ text: string; href?: string }[]>([]);
  const flushHeld = useRef<() => void>(() => {});

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const { data: pets } = useRows(
    async () => must(await supabase.from("pets").select("*").order("created_at")) as Pet[],
    []
  );

  useEffect(() => {
    messagesRef.current = messages;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  /** Sends a user message, streams the reply into the transcript, returns the reply text. */
  const send = useCallback(
    async (text: string, opts: { voice?: boolean } = {}) => {
      const content = text.trim();
      if (!content) return "";
      const history = [...messagesRef.current.filter((m) => !m.error && m.content), { role: "user" as const, content }];
      setMessages((m) => [...m, { role: "user", content }, { role: "assistant", content: "", status: "Thinking…" }]);
      messagesRef.current = [...messagesRef.current, { role: "user", content }];
      setBusy(true);
      streamingRef.current = true;

      const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((all) => {
          const copy = [...all];
          copy[copy.length - 1] = fn(copy[copy.length - 1]);
          return copy;
        });

      let reply = "";
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.slice(-30).map(({ role, content }) => ({ role, content })),
            petId: petId || null,
            voice: Boolean(opts.voice),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as
              | { type: "text"; text: string }
              | { type: "status"; text: string }
              | { type: "action"; label: string; href: string }
              | { type: "booking"; id: string }
              | { type: "error"; message: string }
              | { type: "done" };
            if (ev.type === "text") {
              reply += ev.text;
              patchLast((m) => ({ ...m, content: m.content + ev.text, status: undefined }));
            } else if (ev.type === "status") {
              patchLast((m) => ({ ...m, status: ev.text }));
            } else if (ev.type === "action") {
              patchLast((m) => ({ ...m, actions: [...(m.actions ?? []), { label: ev.label, href: ev.href }] }));
            } else if (ev.type === "booking") {
              watchedRef.current.set(ev.id, "requested");
              setWatchCount(watchedRef.current.size);
            } else if (ev.type === "error") {
              reply = reply || ev.message;
              patchLast((m) => ({ ...m, content: m.content || ev.message, error: !m.content, status: undefined }));
            }
          }
        }
        patchLast((m) => ({ ...m, status: undefined }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        patchLast((m) => ({ ...m, content: message, error: true, status: undefined }));
        reply = "";
        if (!opts.voice) toast.error(message);
      } finally {
        setBusy(false);
        streamingRef.current = false;
      }
      messagesRef.current = [...messagesRef.current, { role: "assistant", content: reply }];
      flushHeld.current();
      return reply;
    },
    [petId]
  );

  /** Adds a message from PawPal that the user didn't ask for (booking updates), and speaks it in voice mode. */
  const announce = useCallback(
    (text: string, href?: string) => {
      if (streamingRef.current) {
        heldRef.current.push({ text, href });
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: text, actions: href ? [{ label: "View appointment", href }] : undefined }]);
      messagesRef.current = [...messagesRef.current, { role: "assistant", content: text }];
      if (voiceModeRef.current) {
        spokenQueueRef.current.push(text);
        // Interrupt listening so the loop speaks the update straight away.
        if (phaseRef.current === "listening") voice.stopAll();
      }
    },
    [voice]
  );

  useEffect(() => {
    flushHeld.current = () => {
      const held = heldRef.current.splice(0);
      held.forEach(({ text, href }) => announce(text, href));
    };
  }, [announce]);

  // Poll bookings the workflow is handling and report each outcome once.
  useEffect(() => {
    if (!watchCount) return;
    const timer = setInterval(async () => {
      const ids = [...watchedRef.current.keys()];
      if (!ids.length) return;
      const { data } = await supabase
        .from("appointments")
        .select("id, pet_id, title, status, starts_at, location, notes, booking_options")
        .in("id", ids);
      for (const a of (data ?? []) as Appointment[]) {
        const prev = watchedRef.current.get(a.id);
        if (prev === a.status) continue;
        watchedRef.current.set(a.id, a.status);
        const href = `/pets/${a.pet_id}?tab=appointments`;
        const when = (iso: string) =>
          new Date(iso).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
        if (a.status === "scheduled") {
          watchedRef.current.delete(a.id);
          // The title usually names the clinic already ("Check-up at …"); then only add the street address.
          const [place, ...address] = (a.location ?? "").split(", ");
          const where = !a.location ? "" : a.title.includes(place) ? address.join(", ") : a.location;
          announce(`Booked! ${a.title} on ${when(a.starts_at)}${where ? `, ${where}` : ""}. It's in your Google Calendar too.`, href);
        } else if (a.status === "options" && a.booking_options?.length) {
          const list = a.booking_options
            .map((o, i) => `${i + 1}) ${when(o.starts_at)} with ${o.doctor_name} at ${o.clinic_name}`)
            .join("; ");
          announce(`The clinics couldn't do the time you asked for. Available: ${list}. Which one should I book? Or say no.`, href);
        } else if (a.status === "cancelled") {
          watchedRef.current.delete(a.id);
          const reason = a.notes?.split("\n").reverse().find((l) => l.startsWith("Clinic: "))?.slice(8);
          announce(`Sorry, I couldn't book ${a.title}.${reason ? ` ${reason}` : ""}`, href);
        }
      }
      setWatchCount(watchedRef.current.size);
    }, 4000);
    return () => clearInterval(timer);
  }, [watchCount, supabase, announce]);

  /* ---------------- Voice conversation loop ---------------- */
  const runVoiceLoop = useCallback(async () => {
    while (voiceModeRef.current) {
      try {
        while (spokenQueueRef.current.length && voiceModeRef.current) {
          setPhase("speaking");
          await voice.speak(spokenQueueRef.current.shift()!);
        }
        if (!voiceModeRef.current) break;
        setPhase("listening");
        const heard = await voice.listen();
        if (!voiceModeRef.current) break;
        if (!heard) continue;
        setLastHeard(heard);
        if (/^(stop|bye|goodbye|that's all|thank you,? that's all)\.?$/i.test(heard.trim())) break;
        setPhase("thinking");
        const reply = await send(heard, { voice: true });
        if (!voiceModeRef.current) break;
        if (reply) {
          setPhase("speaking");
          await voice.speak(reply);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Voice error");
        break;
      }
    }
    voiceModeRef.current = false;
    setVoiceMode(false);
    setPhase("idle");
  }, [send, voice]);

  function startVoice() {
    if (voice.engine === "none") {
      toast.error("Voice isn't supported in this browser. Try Chrome, Edge or Safari.");
      return;
    }
    voiceModeRef.current = true;
    setVoiceMode(true);
    setLastHeard("");
    void runVoiceLoop();
  }

  function stopVoice() {
    voiceModeRef.current = false;
    voice.stopAll();
    setVoiceMode(false);
    setPhase("idle");
  }

  async function dictate() {
    try {
      const heard = await voice.listen();
      if (heard) setInput((v) => (v ? `${v} ${heard}` : heard));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Voice error");
    }
  }

  function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const text = input;
    setInput("");
    void send(text);
  }

  const selectedPet = pets?.find((p) => p.id === petId);

  return (
    <div className="mx-auto flex h-[calc(100dvh-10.5rem)] max-w-3xl flex-col md:h-[calc(100dvh-7.5rem)]">
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold leading-tight">PawPal Assistant</h1>
            <p className="text-xs text-muted-foreground">
              Knows your pets&apos; records · can add routines & appointments
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {pets && pets.length > 0 && (
            <NativeSelect value={petId} onChange={(e) => setPetId(e.target.value)} className="h-9 w-auto" aria-label="Pet">
              <option value="">All pets</option>
              {pets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          )}
          <Button onClick={startVoice} disabled={voiceMode || busy} className="h-9">
            <AudioLines /> Talk
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto rounded-3xl border bg-card/70 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="grid size-16 place-items-center rounded-3xl bg-secondary text-primary">
              <PawIcon className="size-9" />
            </span>
            <p className="mt-4 font-heading text-2xl font-semibold">
              Hi! Ask me anything about {selectedPet?.name ?? "your pets"}.
            </p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Type below, or tap <strong>Talk</strong> for a hands-free voice conversation.
            </p>
            <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border bg-background px-3 py-1.5 text-sm transition-colors hover:border-primary/50 hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-2", m.role === "user" && "justify-end")}>
                {m.role === "assistant" && (
                  <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <PawIcon className="size-4" />
                  </span>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border",
                    m.error && "border-destructive/40 text-destructive"
                  )}
                >
                  {m.role === "user" ? (
                    <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                  ) : m.content ? (
                    <Markdown text={m.content} />
                  ) : null}
                  {m.status && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> {m.status}
                    </p>
                  )}
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.actions.map((a, j) => (
                        <Link
                          key={j}
                          href={a.href}
                          className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground hover:underline"
                        >
                          <Check className="size-3" /> {a.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="mt-3 flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          rows={1}
          placeholder="Ask about feeding, behaviour, health… or paste vet instructions"
          className="max-h-40 min-h-10 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={voice.listening ? "Stop dictation" : "Dictate"}
          onClick={() => (voice.listening ? voice.stopAll() : dictate())}
          disabled={voiceMode || voice.engine === "none"}
          className={cn(voice.listening && !voiceMode && "text-primary")}
        >
          {voice.listening && !voiceMode ? <Square /> : <Mic />}
        </Button>
        <Button type="submit" size="icon-lg" aria-label="Send" disabled={busy || !input.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        PawPal can make mistakes and isn&apos;t a vet. In an emergency, call your vet or emergency clinic.
      </p>

      {voiceMode && (
        <VoiceOverlay
          phase={phase}
          level={voice.level}
          heard={lastHeard}
          reply={messages.at(-1)?.role === "assistant" ? (messages.at(-1)?.content ?? "") : ""}
          engine={voice.engine}
          onStop={stopVoice}
        />
      )}
    </div>
  );
}

function VoiceOverlay({
  phase,
  level,
  heard,
  reply,
  engine,
  onStop,
}: {
  phase: VoicePhase;
  level: number;
  heard: string;
  reply: string;
  engine: string;
  onStop: () => void;
}) {
  const label = {
    idle: "Starting…",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
  }[phase];
  const scale = phase === "listening" ? 1 + level * 0.5 : 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 px-6 backdrop-blur">
      <button
        type="button"
        onClick={onStop}
        aria-label="End voice conversation"
        className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border hover:bg-muted"
      >
        <X className="size-5" />
      </button>

      <div className="relative grid size-56 place-items-center">
        <span
          className={cn(
            "absolute inset-0 rounded-full bg-primary/15",
            (phase === "speaking" || phase === "thinking") && "animate-ping [animation-duration:2s]"
          )}
        />
        <span
          className="absolute inset-6 rounded-full bg-primary/25 transition-transform duration-100"
          style={{ transform: `scale(${scale})` }}
        />
        <span
          className={cn(
            "relative grid size-32 place-items-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-transform",
            phase === "thinking" && "animate-pulse"
          )}
        >
          {phase === "thinking" ? <Loader2 className="size-12 animate-spin" /> : <PawIcon className="size-14" />}
        </span>
      </div>

      <p className="mt-8 font-heading text-2xl font-semibold">{label}</p>
      <div className="mt-4 min-h-24 max-w-lg space-y-3 text-center">
        {heard && <p className="text-sm text-muted-foreground">“{heard}”</p>}
        {reply && phase !== "listening" && <p className="text-base">{reply.replace(/[*_`#]/g, "")}</p>}
      </div>

      <Button variant="outline" onClick={onStop} className="mt-8 h-11 px-6">
        <Square /> End conversation
      </Button>
      <p className="mt-4 text-xs text-muted-foreground">
        {engine === "elevenlabs" ? "Voice by ElevenLabs" : "Using your browser's built-in voice"} · say “stop” to finish
      </p>
    </div>
  );
}

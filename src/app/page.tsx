import Link from "next/link";
import {
  Bell,
  CalendarHeart,
  ClipboardCheck,
  MessagesSquare,
  Mic,
  ShieldCheck,
  Sparkles,
  Syringe,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/app/logo";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: CalendarHeart,
    title: "Daily routines",
    body: "Feeding, walks and meds for every pet on one Today list. Tick them off as you go.",
  },
  {
    icon: Syringe,
    title: "Health records",
    body: "Vaccinations with due-date reminders, plus vet and grooming appointments in one place.",
  },
  {
    icon: ClipboardCheck,
    title: "AI checklists",
    body: "Paste the vet's discharge notes. Get an editable, step-by-step care checklist in seconds.",
  },
  {
    icon: Mic,
    title: "Voice assistant",
    body: "Ask out loud — “when is Bruno's rabies booster?” — and hear the answer back.",
  },
  {
    icon: MessagesSquare,
    title: "Community",
    body: "Ask fellow pet owners, upvote the best answers, and get an instant AI suggestion.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "Your pet records are visible only to you, enforced in the database with row-level security.",
  },
];

export default function Landing() {
  return (
    <div className="bg-paws min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-4">
        <Logo />
        <div className="ml-auto flex items-center gap-2">
          <Link href="/community" className={buttonVariants({ variant: "ghost" })}>
            Community
          </Link>
          <Link href="/login" className={buttonVariants()}>
            Get started
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 md:grid-cols-[1.1fr_1fr] md:pt-20">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" /> AI-powered pet care companion
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.08] sm:text-5xl md:text-6xl">
            Every walk, meal and vet visit, <span className="text-primary">handled.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            PawPal keeps your pets&apos; routines, vaccinations and appointments organised, and turns any care
            instructions into a checklist you can actually follow.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}>
              Create your pet&apos;s profile
            </Link>
            <Link
              href="/login?guest=1"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-base")}
            >
              Try it as a guest
            </Link>
          </div>
        </div>

        <HeroPreview />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-5 shadow-sm">
              <span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        PawPal gives general care guidance and is not a substitute for a veterinarian.
      </footer>
    </div>
  );
}

function HeroPreview() {
  const tasks = [
    { emoji: "🍖", title: "Breakfast — 1 cup kibble", time: "8:00 am", done: true },
    { emoji: "🦮", title: "Morning walk (30 min)", time: "8:30 am", done: true },
    { emoji: "💊", title: "Carprofen with food", time: "6:00 pm", done: false },
    { emoji: "🦮", title: "Evening walk", time: "7:00 pm", done: false },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/20 via-transparent to-chart-2/20 blur-2xl" />
      <div className="rounded-3xl border bg-card p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-2xl">🐶</span>
          <div>
            <p className="font-heading text-lg font-semibold">Bruno&apos;s day</p>
            <p className="text-xs text-muted-foreground">Golden Retriever · 3 yrs · 29 kg</p>
          </div>
          <span className="ml-auto rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
            2 / 4 done
          </span>
        </div>
        <ul className="mt-4 space-y-2">
          {tasks.map((t) => (
            <li
              key={t.title}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm",
                t.done && "bg-muted/60 text-muted-foreground line-through"
              )}
            >
              <span>{t.emoji}</span>
              <span className="flex-1">{t.title}</span>
              <span className="text-xs">{t.time}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-secondary p-3 text-sm">
          <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>Rabies booster due in 9 days. Want me to book the vet?</span>
        </div>
      </div>
    </div>
  );
}

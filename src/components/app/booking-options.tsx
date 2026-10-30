"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CalendarCheck, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Appointment } from "@/lib/types";

/** Slots the booking workflow offered for a request it couldn't book as asked. */
export function BookingOptions({ appt, petName, onDone }: { appt: Appointment; petName: string; onDone: () => void }) {
  const [busy, setBusy] = useState<number | "none" | null>(null);

  async function choose(choice: number | null) {
    setBusy(choice ?? "none");
    const res = await fetch("/api/booking/choose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointment_id: appt.id, choice }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return toast.error(json.error ?? "Couldn't send your choice");
    toast.success(choice === null ? "Request cancelled" : "Booking that slot — it'll show as confirmed shortly");
    onDone();
  }

  return (
    <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <p className="font-medium">
        {appt.title} <span className="font-normal text-muted-foreground">· {petName}</span>
      </p>
      <p className="text-xs text-muted-foreground">The clinics couldn&apos;t do the time you asked for. Pick another:</p>
      <div className="grid gap-1.5">
        {appt.booking_options?.map((o, i) => (
          <Button
            key={`${o.doctor_id}-${o.starts_at}`}
            variant="outline"
            size="sm"
            className="h-auto justify-start py-1.5 text-left"
            disabled={busy !== null}
            onClick={() => choose(i)}
          >
            {busy === i ? <Loader2 className="animate-spin" /> : <CalendarCheck />}
            <span className="min-w-0">
              <span className="block font-medium">{format(new Date(o.starts_at), "EEE d MMM, h:mm a")}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {o.doctor_name} · {o.clinic_name}
              </span>
            </span>
          </Button>
        ))}
        <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" disabled={busy !== null} onClick={() => choose(null)}>
          {busy === "none" ? <Loader2 className="animate-spin" /> : <X />} None of these
        </Button>
      </div>
    </div>
  );
}

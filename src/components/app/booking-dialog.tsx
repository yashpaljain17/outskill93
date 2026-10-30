"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addDays, format, setHours, setMinutes } from "date-fns";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/app/fields";
import { useSupabase, useUser } from "@/hooks/use-supabase";
import type { Place } from "@/lib/places";
import type { Pet } from "@/lib/types";

const REASONS = ["Check-up", "Vaccination", "Illness or injury", "Dental", "Skin or allergy", "Follow-up visit"];

/** Sends a booking request for a nearby clinic to the n8n workflow via /api/booking. */
export function BookingDialog({ clinic, onOpenChange }: { clinic: Place | null; onOpenChange: (open: boolean) => void }) {
  const supabase = useSupabase();
  const { user } = useUser();
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!clinic || pets) return;
    supabase
      .from("pets")
      .select("*")
      .order("created_at")
      .then(({ data, error }) => (error ? toast.error(error.message) : setPets(data as Pet[])));
  }, [clinic, pets, supabase]);

  const defaultWhen = format(setMinutes(setHours(addDays(new Date(), 1), 10), 0), "yyyy-MM-dd'T'HH:mm");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!clinic) return;
    const f = new FormData(e.currentTarget);
    const when = new Date(String(f.get("preferred_at")));
    if (Number.isNaN(when.getTime()) || when < new Date()) return toast.error("Pick a time in the future");

    setBusy(true);
    const res = await fetch("/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pet_id: f.get("pet_id"),
        preferred_at: when.toISOString(),
        reason: f.get("reason"),
        notes: String(f.get("notes") ?? "").trim() || undefined,
        contact: String(f.get("contact") ?? "").trim(),
        clinic: {
          id: clinic.id,
          clinic_id: clinic.clinicId,
          name: clinic.name,
          lat: clinic.lat,
          lon: clinic.lon,
          address: clinic.address,
          phone: clinic.phone,
          email: clinic.email,
          website: clinic.website,
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast.error(json.error ?? "Booking failed");

    toast.success(json.sent ? "Request sent — you'll see it confirmed on your dashboard" : "Saved as a booking request", {
      description: json.sent ? undefined : "Connect the n8n workflow to contact clinics automatically.",
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={!!clinic} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Request a vet visit</DialogTitle>
          <DialogDescription>
            {clinic?.name}
            {clinic?.address && ` · ${clinic.address}`}
          </DialogDescription>
        </DialogHeader>

        {pets && pets.length === 0 ? (
          <div className="space-y-3 text-sm">
            <p>Add a pet first so the clinic knows who they&apos;re seeing.</p>
            <Link href="/pets" className={buttonVariants()}>
              Add a pet
            </Link>
          </div>
        ) : !pets ? (
          <div className="grid h-40 place-items-center">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <Field label="Pet" htmlFor="pet_id">
              <NativeSelect id="pet_id" name="pet_id" defaultValue={pets[0]?.id} required>
                {pets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Reason" htmlFor="reason">
              <NativeSelect id="reason" name="reason" defaultValue={REASONS[0]}>
                {REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Preferred time" htmlFor="preferred_at" hint="The clinic may suggest another slot.">
              <Input id="preferred_at" name="preferred_at" type="datetime-local" defaultValue={defaultWhen} required />
            </Field>
            <Field label="Your phone or email" htmlFor="contact" hint="So the clinic can reach you.">
              <Input id="contact" name="contact" defaultValue={user?.email ?? ""} placeholder="+91 98… or you@mail.com" required minLength={3} />
            </Field>
            <Field label="Notes for the vet" htmlFor="notes" className="sm:col-span-2">
              <Textarea id="notes" name="notes" rows={3} placeholder="Symptoms, medications, anything they should know" />
            </Field>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />} Send request
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

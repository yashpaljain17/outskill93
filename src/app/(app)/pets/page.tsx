"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/fields";
import { PetAvatar } from "@/components/app/pet-avatar";
import { PetFormDialog } from "@/components/app/pet-form-dialog";
import { useSupabase } from "@/hooks/use-supabase";
import { must, useRows } from "@/hooks/use-rows";
import { petAge } from "@/lib/pet";
import type { Pet } from "@/lib/types";

export default function PetsPage() {
  const supabase = useSupabase();
  const [open, setOpen] = useState(false);
  const { data: pets, loading, reload } = useRows(
    async () => must(await supabase.from("pets").select("*").order("created_at")) as Pet[],
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Your pets</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus /> Add pet
        </Button>
      </div>
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : !pets?.length ? (
        <EmptyState emoji="🐾" title="No pets yet" body="Add your first pet to start tracking their care.">
          <Button onClick={() => setOpen(true)}>
            <Plus /> Add a pet
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pets.map((p) => (
            <Link
              key={p.id}
              href={`/pets/${p.id}`}
              className="group rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-4">
                <PetAvatar pet={p} className="size-16 text-3xl" />
                <div className="min-w-0">
                  <p className="font-heading text-xl font-semibold">{p.name}</p>
                  <p className="truncate text-sm capitalize text-muted-foreground">{p.breed ?? p.species}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
                {petAge(p.birth_date) && <span className="rounded-full bg-secondary px-2 py-0.5">{petAge(p.birth_date)}</span>}
                {p.weight_kg && <span className="rounded-full bg-secondary px-2 py-0.5">{p.weight_kg} kg</span>}
                {p.sex && <span className="rounded-full bg-secondary px-2 py-0.5 capitalize">{p.sex}</span>}
                {p.allergies && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300">
                    Allergic: {p.allergies}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
      <PetFormDialog open={open} onOpenChange={setOpen} onSaved={() => reload()} />
    </div>
  );
}

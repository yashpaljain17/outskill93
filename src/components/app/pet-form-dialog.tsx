"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/app/fields";
import { PetAvatar } from "@/components/app/pet-avatar";
import { useSupabase } from "@/hooks/use-supabase";
import type { Pet } from "@/lib/types";

export function PetFormDialog({
  open,
  onOpenChange,
  pet,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pet?: Pet | null;
  onSaved: (pet: Pet) => void;
}) {
  const supabase = useSupabase();
  const [busy, setBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(pet?.photo_url ?? null);
  const [species, setSpecies] = useState<string>(pet?.species ?? "dog");
  const [uploading, setUploading] = useState(false);

  async function uploadPhoto(file: File) {
    if (file.size > 5 * 1024 * 1024) return toast.error("Please pick an image under 5 MB.");
    setUploading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUploading(false);
      return toast.error("Sign in first");
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("pet-photos").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) return toast.error(error.message);
    setPhotoUrl(supabase.storage.from("pet-photos").getPublicUrl(path).data.publicUrl);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const str = (k: string) => (String(f.get(k) ?? "").trim() || null);
    const weight = str("weight_kg");
    const values = {
      name: String(f.get("name")).trim(),
      species,
      breed: str("breed"),
      sex: str("sex"),
      birth_date: str("birth_date"),
      weight_kg: weight ? Number(weight) : null,
      allergies: str("allergies"),
      notes: str("notes"),
      photo_url: photoUrl,
    };
    setBusy(true);
    const query = pet
      ? supabase.from("pets").update(values).eq("id", pet.id).select().single()
      : supabase.from("pets").insert(values).select().single();
    const { data, error } = await query;
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(pet ? "Saved" : `${values.name} added!`);
    onSaved(data as Pet);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{pet ? `Edit ${pet.name}` : "Add a pet"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 sm:col-span-2">
            <PetAvatar pet={{ name: "pet", species, photo_url: photoUrl }} className="size-16" />
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {photoUrl ? "Change photo" : "Add photo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
              />
            </label>
          </div>
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" required defaultValue={pet?.name} placeholder="Bruno" />
          </Field>
          <Field label="Species" htmlFor="species">
            <NativeSelect id="species" value={species} onChange={(e) => setSpecies(e.target.value)}>
              <option value="dog">Dog</option>
              <option value="cat">Cat</option>
              <option value="bird">Bird</option>
              <option value="rabbit">Rabbit</option>
              <option value="fish">Fish</option>
              <option value="reptile">Reptile</option>
              <option value="other">Other</option>
            </NativeSelect>
          </Field>
          <Field label="Breed" htmlFor="breed">
            <Input id="breed" name="breed" defaultValue={pet?.breed ?? ""} placeholder="Golden Retriever" />
          </Field>
          <Field label="Sex" htmlFor="sex">
            <NativeSelect id="sex" name="sex" defaultValue={pet?.sex ?? ""}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </NativeSelect>
          </Field>
          <Field label="Birthday" htmlFor="birth_date">
            <Input id="birth_date" name="birth_date" type="date" defaultValue={pet?.birth_date ?? ""} />
          </Field>
          <Field label="Weight (kg)" htmlFor="weight_kg">
            <Input
              id="weight_kg"
              name="weight_kg"
              type="number"
              step="0.1"
              min="0"
              defaultValue={pet?.weight_kg ?? ""}
            />
          </Field>
          <Field label="Allergies" htmlFor="allergies" className="sm:col-span-2">
            <Input id="allergies" name="allergies" defaultValue={pet?.allergies ?? ""} placeholder="Chicken, pollen" />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
            <Textarea
              id="notes"
              name="notes"
              defaultValue={pet?.notes ?? ""}
              placeholder="Temperament, vet details, anything useful"
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={busy || uploading}>
              {busy && <Loader2 className="animate-spin" />}
              {pet ? "Save changes" : "Add pet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { SPECIES_EMOJI } from "@/lib/pet";
import type { Pet } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PetAvatar({ pet, className }: { pet: Pick<Pet, "name" | "species" | "photo_url">; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary text-2xl",
        className
      )}
    >
      {pet.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pet.photo_url} alt={pet.name} className="size-full object-cover" />
      ) : (
        <span aria-hidden>{SPECIES_EMOJI[pet.species] ?? "🐾"}</span>
      )}
    </span>
  );
}

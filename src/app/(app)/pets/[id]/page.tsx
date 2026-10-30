import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { PetDetail } from "./pet-detail";

export default function PetPage(props: PageProps<"/pets/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PetPageContent {...props} />
    </Suspense>
  );
}

async function PetPageContent({ params, searchParams }: PageProps<"/pets/[id]">) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <PetDetail id={id} initialTab={typeof tab === "string" ? tab : "overview"} />;
}

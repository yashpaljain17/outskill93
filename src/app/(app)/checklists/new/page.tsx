import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { ChecklistBuilder } from "./checklist-builder";

export default function NewChecklistPage(props: PageProps<"/checklists/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewChecklistContent {...props} />
    </Suspense>
  );
}

async function NewChecklistContent({ searchParams }: PageProps<"/checklists/new">) {
  const { pet } = await searchParams;
  return <ChecklistBuilder initialPetId={typeof pet === "string" ? pet : null} />;
}

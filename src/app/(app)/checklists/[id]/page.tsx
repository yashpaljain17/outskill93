import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { ChecklistEditor } from "./checklist-editor";

export default function ChecklistPage(props: PageProps<"/checklists/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ChecklistPageContent {...props} />
    </Suspense>
  );
}

async function ChecklistPageContent({ params }: PageProps<"/checklists/[id]">) {
  const { id } = await params;
  return <ChecklistEditor id={id} />;
}

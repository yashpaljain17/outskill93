import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { QuestionThread } from "./question-thread";

export default function QuestionPage(props: PageProps<"/community/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <QuestionPageContent {...props} />
    </Suspense>
  );
}

async function QuestionPageContent({ params }: PageProps<"/community/[id]">) {
  const { id } = await params;
  return <QuestionThread id={id} />;
}

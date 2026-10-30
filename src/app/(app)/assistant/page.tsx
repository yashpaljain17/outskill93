import { Suspense } from "react";
import { Assistant } from "./assistant";

export default function AssistantPage() {
  return (
    <Suspense>
      <Assistant />
    </Suspense>
  );
}

import { Suspense } from "react";
import { AppShell } from "@/components/app/app-shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="bg-paws min-h-dvh" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarHeart, ClipboardCheck, LogOut, MapPin, MessagesSquare, PawPrint, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/app/logo";
import { useSupabase, useUser } from "@/hooks/use-supabase";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Today", icon: CalendarHeart },
  { href: "/pets", label: "Pets", icon: PawPrint },
  { href: "/checklists", label: "Checklists", icon: ClipboardCheck },
  { href: "/nearby", label: "Nearby", icon: MapPin },
  { href: "/community", label: "Community", icon: MessagesSquare },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useSupabase();
  const { user, loading } = useUser();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const name = user?.is_anonymous ? "Guest" : (user?.user_metadata?.display_name ?? user?.email?.split("@")[0]);

  return (
    <div className="flex min-h-dvh flex-col bg-paws">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Logo href={user ? "/dashboard" : "/"} />
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    active && "bg-secondary text-foreground"
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {!loading && user && (
              <>
                <span className="hidden text-sm text-muted-foreground sm:inline">Hi, {name}</span>
                <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" title="Sign out">
                  <LogOut />
                </Button>
              </>
            )}
            {!loading && !user && (
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={buttonVariants()}>
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:pb-12">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground",
                  active && "text-primary"
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

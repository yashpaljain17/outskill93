import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold", className)}>
      <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <PawIcon className="size-5" />
      </span>
      <span className="font-heading text-xl tracking-tight">PawPal</span>
    </Link>
  );
}

export function PawIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <ellipse cx="6" cy="9" rx="2.2" ry="2.8" />
      <ellipse cx="10" cy="5.5" rx="2.2" ry="2.8" />
      <ellipse cx="14" cy="5.5" rx="2.2" ry="2.8" />
      <ellipse cx="18" cy="9" rx="2.2" ry="2.8" />
      <path d="M12 11c-3 0-6 3.6-6 6.3 0 1.9 1.5 2.7 3 2.7 1.3 0 2-.6 3-.6s1.7.6 3 .6c1.5 0 3-.8 3-2.7C18 14.6 15 11 12 11Z" />
    </svg>
  );
}

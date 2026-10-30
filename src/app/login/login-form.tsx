"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSupabase } from "@/hooks/use-supabase";

export function LoginForm() {
  const supabase = useSupabase();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [busy, setBusy] = useState(false);
  const guestTried = useRef(false);

  useEffect(() => {
    if (params.get("error")) toast.error("That sign-in link didn't work. Please try again.");
  }, [params]);

  async function continueAsGuest() {
    setBusy(true);
    const { error } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("disabled")
          ? "Guest access is turned off for this project. Please create an account."
          : error.message
      );
      return;
    }
    router.replace(next);
    router.refresh();
  }

  useEffect(() => {
    if (params.get("guest") === "1" && !guestTried.current) {
      guestTried.current = true;
      void continueAsGuest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const displayName = String(form.get("name") ?? "");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || email.split("@")[0] },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your inbox to confirm your email, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </CardTitle>
        <CardDescription>
          {mode === "signup" ? "Set up profiles for your pets in a minute." : "Sign in to see today's care plan."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="space-y-3">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" autoComplete="name" placeholder="Alex" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>
          <Button type="submit" className="h-10 w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>

        <div className="relative text-center text-xs text-muted-foreground">
          <span className="relative z-10 bg-card px-2">or</span>
          <span className="absolute inset-x-0 top-1/2 -z-0 border-t" />
        </div>

        <Button variant="outline" className="h-10 w-full" onClick={continueAsGuest} disabled={busy}>
          <UserRound /> Continue as guest
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "signup" ? "Already have an account?" : "New to PawPal?"}{" "}
          <button
            type="button"
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          >
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </p>
      </CardContent>
    </Card>
  );
}

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

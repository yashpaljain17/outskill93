import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/app/logo";

export default function LoginPage() {
  return (
    <div className="bg-paws grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

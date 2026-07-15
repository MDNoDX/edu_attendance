import Link from "next/link";
import { Logo } from "@/components/logo";
import { SignupForm } from "./signup-form";
import { APP_NAME } from "@/lib/constants";

export default function SignupPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

      <div className="glass relative w-full max-w-md rounded-2xl p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={48} className="mb-3" />
          <h1 className="text-xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O&apos;z hisobingizni yarating — guruhlaringizni, davomatni va hisob-kitobingizni
            mustaqil boshqaring
          </p>
        </div>

        <SignupForm />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Hisobingiz bormi?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Kirish
          </Link>
        </p>
      </div>
    </div>
  );
}

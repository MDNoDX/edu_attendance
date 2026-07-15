import Link from "next/link";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";
import { APP_NAME } from "@/lib/constants";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/40 blur-3xl" />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="glass relative w-full max-w-sm rounded-2xl p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={48} className="mb-3" />
          <h1 className="text-xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tizimga kirish uchun login va parolingizni kiriting</p>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Hisobingiz yo&apos;qmi?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Ro&apos;yxatdan o&apos;tish
          </Link>
        </p>
      </div>
    </div>
  );
}

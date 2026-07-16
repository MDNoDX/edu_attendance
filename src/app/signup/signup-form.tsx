"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerSchema, type RegisterInput } from "@/lib/validations";
import { checkUsernameAvailable } from "@/app/actions/username";

type UsernameStatus = "idle" | "checking" | "available" | "taken";

export function SignupForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const usernameValue = watch("username");

  // Live "is this login taken" check while typing, debounced so it doesn't
  // fire on every keystroke. A stale-response guard (via the `cancelled`
  // flag) makes sure a slow earlier check can never overwrite the result of
  // a more recent one if they resolve out of order.
  useEffect(() => {
    if (!usernameValue || usernameValue.length < 3 || errors.username) {
      setUsernameStatus("idle");
      return;
    }
    let cancelled = false;
    setUsernameStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await checkUsernameAvailable(usernameValue);
        if (cancelled) return;
        setUsernameStatus(res.available ? "available" : "taken");
      } catch {
        if (!cancelled) setUsernameStatus("idle");
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [usernameValue, errors.username]);

  async function onSubmit(data: RegisterInput) {
    setServerError(null);
    if (usernameStatus === "taken") {
      setServerError("Bu login band. Boshqa login tanlang.");
      return;
    }
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();

    if (!res.ok) {
      setServerError(json.error ?? "Xatolik yuz berdi.");
      return;
    }

    toast.success("Hisob yaratildi. Xush kelibsiz!");
    router.push(json.redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="firstName">Ism</Label>
          <Input id="firstName" autoComplete="given-name" {...register("firstName")} />
          {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Familiya</Label>
          <Input id="lastName" autoComplete="family-name" {...register("lastName")} />
          {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="username">Login</Label>
        <div className="relative">
          <Input id="username" autoComplete="username" className="pr-9" {...register("username")} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {usernameStatus === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {usernameStatus === "available" && <Check className="h-4 w-4 text-success" />}
            {usernameStatus === "taken" && <X className="h-4 w-4 text-destructive" />}
          </span>
        </div>
        {errors.username ? (
          <p className="text-xs text-destructive">{errors.username.message}</p>
        ) : usernameStatus === "taken" ? (
          <p className="text-xs text-destructive">Bu login band — boshqasini tanlang.</p>
        ) : usernameStatus === "available" ? (
          <p className="text-xs text-success">Bu login bo&apos;sh, ishlatishingiz mumkin.</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Parol</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            className="pr-10"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Parolni tasdiqlang</Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            className="pr-10"
            {...register("confirmPassword")}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showConfirmPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
          >
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      {serverError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Ro&apos;yxatdan o&apos;tish
      </Button>
    </form>
  );
}

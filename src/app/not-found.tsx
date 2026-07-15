import Link from "next/link";
import { SearchX } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function RootNotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 overflow-hidden bg-background px-4 text-center">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <Logo size={40} className="relative mb-1" />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="h-7 w-7" />
      </div>
      <div className="relative space-y-1">
        <h1 className="text-lg font-semibold">Sahifa topilmadi</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Siz izlagan manzil mavjud emas.</p>
      </div>
      <Button asChild className="relative">
        <Link href="/login">Kirish sahifasiga qaytish</Link>
      </Button>
    </div>
  );
}

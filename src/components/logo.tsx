import Image from "next/image";
import { cn } from "@/lib/utils";

/** The NadirEdu graduation-cap mark. Renders the static SVG asset at public/logo.svg. */
export function Logo({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/logo.svg"
      alt="NadirEdu"
      width={size}
      height={Math.round(size * 0.9)}
      className={cn("shrink-0", className)}
      priority
    />
  );
}

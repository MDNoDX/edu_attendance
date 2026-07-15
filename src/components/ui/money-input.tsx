"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function digitsOnly(value: string) {
  return value.replace(/[^\d]/g, "");
}

function formatWithSpaces(digits: string) {
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export interface MoneyInputProps {
  value: number | string | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  suffix?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * A plain number input reads "18500" as one unbroken blob, which is easy to
 * mistype (18500 vs 185000) — this renders it live as "18 500" while
 * `onChange` still reports the real numeric value, for any so'm-denominated
 * field (course price, teacher lesson rate, etc).
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, placeholder, suffix = "so'm", className, disabled, id }, ref) => {
    const [display, setDisplay] = React.useState(() => formatWithSpaces(String(value ?? "").replace(/\D/g, "")));

    React.useEffect(() => {
      const raw = value === undefined || value === null || value === "" ? "" : String(value);
      setDisplay(formatWithSpaces(digitsOnly(raw)));
      // Only re-sync from external value changes (e.g. form.reset), not on every keystroke.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const digits = digitsOnly(e.target.value);
      setDisplay(formatWithSpaces(digits));
      onChange(digits === "" ? undefined : Number(digits));
    }

    return (
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(suffix && "pr-14", className)}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    );
  },
);
MoneyInput.displayName = "MoneyInput";

"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const MAX_DIMENSION = 320;
const JPEG_QUALITY = 0.82;

/** Downscales + re-encodes the selected image client-side so the base64 data URL we store on Student.photoUrl stays small (no blob storage is configured, so photos live directly in Postgres as text). */
function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Faylni o'qib bo'lmadi."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Rasm formatini o'qib bo'lmadi."));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Brauzer rasmni qayta ishlay olmadi."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function PhotoUpload({
  value,
  onChange,
  fallbackText,
}: {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  fallbackText: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Faqat rasm fayl tanlang.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Rasm hajmi 8MB dan oshmasin.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      onChange(dataUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rasmni yuklab bo'lmadi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-16 w-16">
        {value ? <AvatarImage src={value} alt={fallbackText} /> : null}
        <AvatarFallback className="text-base">{fallbackText}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Camera className="h-3.5 w-3.5" /> {busy ? "Yuklanmoqda..." : "Rasm tanlash"}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => onChange(null)}
          >
            <X className="h-3.5 w-3.5" /> Rasmni o'chirish
          </Button>
        )}
      </div>
    </div>
  );
}

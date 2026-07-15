"use client";

import { useState } from "react";
import { FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ATTENDANCE_REPORT_FIELDS } from "@/lib/reports/fields";

interface GroupOption {
  id: string;
  name: string;
}

/**
 * Self-service export: the teacher picks a group (or every group), a
 * period, and exactly which columns should appear — per the product
 * requirement that the teacher controls their own PDF/Excel output.
 */
export function TeacherReports({ groups }: { groups: GroupOption[] }) {
  const [groupId, setGroupId] = useState<string>("__all__");
  const [period, setPeriod] = useState("monthly");
  const [selectedFields, setSelectedFields] = useState<string[]>(
    ATTENDANCE_REPORT_FIELDS.filter((f) => f.defaultSelected).map((f) => f.key),
  );

  function toggleField(key: string) {
    setSelectedFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function buildUrl(format: "xlsx" | "pdf") {
    const params = new URLSearchParams({ period, format, fields: selectedFields.join(",") });
    if (groupId !== "__all__") params.set("groupId", groupId);
    return `/api/reports/teacher?${params.toString()}`;
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Guruh</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Barcha guruhlar</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Davr</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Kunlik</SelectItem>
                <SelectItem value="weekly">Haftalik</SelectItem>
                <SelectItem value="monthly">Oylik</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Hisobotda ko&apos;rinadigan ustunlar</Label>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 sm:grid-cols-3">
            {ATTENDANCE_REPORT_FIELDS.map((field) => (
              <label key={field.key} className="flex items-center gap-2 text-sm">
                <Checkbox checked={selectedFields.includes(field.key)} onCheckedChange={() => toggleField(field.key)} />
                {field.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button asChild variant="outline" disabled={selectedFields.length === 0}>
            <a href={buildUrl("xlsx")} download>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </a>
          </Button>
          <Button asChild disabled={selectedFields.length === 0}>
            <a href={buildUrl("pdf")} download>
              <FileText className="h-4 w-4" /> PDF
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface ScheduleRow {
  id: number;
  classId: number;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  location: string | null;
  status: string;
}

interface RescheduleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: number;
  customerName: string;
  classTitle: string;
  sourceScheduleId: number;
  sourceClassId: number;
  sourceDate: string;
  sourceStartTime: string;
  sourceEndTime: string;
  allSchedules: ScheduleRow[];
  onMoved: () => void;
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function RescheduleSheet({
  open,
  onOpenChange,
  bookingId,
  customerName,
  classTitle,
  sourceScheduleId,
  sourceClassId,
  sourceDate,
  sourceStartTime,
  sourceEndTime,
  allSchedules,
  onMoved,
}: RescheduleSheetProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = todayString();
  const eligibleSchedules = useMemo(
    () =>
      allSchedules
        .filter(
          (s) =>
            s.classId === sourceClassId &&
            s.status !== "cancelled" &&
            s.date >= today &&
            s.id !== sourceScheduleId &&
            s.bookedCount < s.capacity,
        )
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    [allSchedules, sourceClassId, sourceScheduleId, today],
  );

  async function handleMove(newScheduleId: number) {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/bookings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bookingId, newScheduleId }),
    });
    if (res.ok) {
      onMoved();
      onOpenChange(false);
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Failed to reschedule. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            Reschedule — {customerName} → {classTitle}
          </SheetTitle>
          <p className="text-sm text-deep-ocean/70">
            Currently on {formatDate(sourceDate)}, {sourceStartTime}–
            {sourceEndTime}
          </p>
        </SheetHeader>

        <div className="px-4 pb-6">
          {error && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <p className="mb-3 text-sm font-medium text-deep-tide-blue">
            Move to:
          </p>

          {eligibleSchedules.length === 0 ? (
            <p className="text-center text-soft-moonstone py-8">
              No other dates available for this class. Add a new schedule first,
              then come back.
            </p>
          ) : (
            <ul className="divide-y divide-soft-moonstone/20">
              {eligibleSchedules.map((s) => {
                const spotsLeft = s.capacity - s.bookedCount;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleMove(s.id)}
                      className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-ocean-light-blue/10 disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-deep-tide-blue">
                          {formatDate(s.date)}
                        </p>
                        <p className="text-xs text-deep-ocean/60">
                          {s.startTime}–{s.endTime}
                          {s.location ? ` · ${s.location}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-deep-ocean">
                        {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

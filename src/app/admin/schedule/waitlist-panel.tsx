"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface WaitlistEntry {
  id: number;
  scheduleId: number;
  customerName: string;
  customerEmail: string;
  createdAt: string;
}

interface WaitlistPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: number;
  classTitle: string;
  date: string;
  onChanged?: () => void;
}

function formatRelative(createdAt: string) {
  const then = new Date(createdAt).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  const minute = 60 * 1000;
  if (diffMs >= day) {
    const d = Math.floor(diffMs / day);
    return `${d}d ago`;
  }
  if (diffMs >= hour) {
    const h = Math.floor(diffMs / hour);
    return `${h}h ago`;
  }
  const m = Math.floor(diffMs / minute);
  return `${m}m ago`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function WaitlistPanel({
  open,
  onOpenChange,
  scheduleId,
  classTitle,
  date,
  onChanged,
}: WaitlistPanelProps) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/waitlist?scheduleId=${scheduleId}`);
    if (res.ok) {
      const data = (await res.json()) as WaitlistEntry[];
      setEntries(data);
    } else {
      setEntries([]);
    }
    setLoading(false);
  }, [scheduleId]);

  useEffect(() => {
    if (open) {
      fetchEntries();
    }
  }, [open, fetchEntries]);

  async function handleRemove(id: number) {
    if (!window.confirm("Remove this person from the waiting list?")) {
      return;
    }
    const res = await fetch(`/api/admin/waitlist?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await fetchEntries();
      onChanged?.();
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Waiting list — {classTitle}</SheetTitle>
          <p className="text-sm text-deep-ocean/70">{formatDate(date)}</p>
        </SheetHeader>

        <div className="px-4 pb-6">
          {loading ? (
            <p className="text-center text-soft-moonstone py-8">Loading...</p>
          ) : entries.length === 0 ? (
            <p className="text-center text-soft-moonstone py-8">
              Nobody on the waiting list yet.
            </p>
          ) : (
            <ul className="divide-y divide-soft-moonstone/20">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-deep-tide-blue truncate">
                      {entry.customerName}
                    </p>
                    <a
                      href={`mailto:${entry.customerEmail}`}
                      className="text-sm text-ocean-light-blue hover:text-deep-tide-blue truncate block"
                    >
                      {entry.customerEmail}
                    </a>
                    <p className="text-xs text-deep-ocean/60">
                      Joined {formatRelative(entry.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(entry.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

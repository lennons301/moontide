"use client";

import { useCallback, useEffect, useState } from "react";
import {
  formatDateWithWeekday,
  formatDeadline,
} from "@/components/admin/format-date";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { HoldDuration } from "@/lib/waitlist/offers";

interface WaitlistOffer {
  offeredAt: string | null;
  expiresAt: string | null;
  expired: boolean;
}

interface WaitlistEntry {
  id: number;
  scheduleId: number;
  customerName: string;
  customerEmail: string;
  createdAt: string;
  offer: WaitlistOffer | null;
}

interface Occupancy {
  capacity: number;
  freeSeats: number;
  offersOutstanding: number;
  seatsWithNobodyOnThem: number;
  canOffer: boolean;
}

interface WaitlistResponse {
  entries: WaitlistEntry[];
  occupancy: Occupancy | null;
  scheduleStatus: string | null;
}

interface WaitlistPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: number;
  classTitle: string;
  date: string;
}

const HOLD_LABELS: { value: HoldDuration; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "48h", label: "48 hours" },
  { value: "class-start", label: "Until the class starts" },
];

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

export function WaitlistPanel({
  open,
  onOpenChange,
  scheduleId,
  classTitle,
  date,
}: WaitlistPanelProps) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [occupancy, setOccupancy] = useState<Occupancy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offeringId, setOfferingId] = useState<number | null>(null);
  const [hold, setHold] = useState<HoldDuration>("24h");
  const [busy, setBusy] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/waitlist?scheduleId=${scheduleId}`);
    if (res.ok) {
      const data = (await res.json()) as WaitlistResponse;
      setEntries(data.entries);
      setOccupancy(data.occupancy);
      setError(null);
    } else {
      setEntries([]);
      setOccupancy(null);
      setError("Failed to load waiting list.");
    }
    setLoading(false);
  }, [scheduleId]);

  useEffect(() => {
    if (open) {
      setOfferingId(null);
      setHold("24h");
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
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    window.alert(data.error || "Failed to remove entry. Please try again.");
  }

  async function handleOffer(id: number) {
    setBusy(true);
    const res = await fetch("/api/admin/waitlist/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: id, hold }),
    });
    setBusy(false);
    if (res.ok) {
      setOfferingId(null);
      await fetchEntries();
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    window.alert(data.error || "Failed to make the offer. Please try again.");
  }

  async function handleWithdraw(id: number) {
    if (
      !window.confirm(
        "Withdraw this offer? The seat is freed for someone else. They stay on the waiting list, and nothing is sent to them — tell them yourself.",
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/waitlist/offer?entryId=${id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (res.ok) {
      await fetchEntries();
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    window.alert(data.error || "Failed to withdraw the offer.");
  }

  // Longest waiting first is how the list is ordered, and it is a prompt, not a
  // rule: Gabrielle knows things the system does not, so any entry can be
  // offered. Nothing here is ever shown to customers.
  const longestWaitingId = entries[0]?.id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Waiting list — {classTitle}</SheetTitle>
          <p className="text-sm text-deep-ocean/70">
            {formatDateWithWeekday(date)}
          </p>
        </SheetHeader>

        <div className="px-4 pb-6">
          {occupancy && (
            <div className="mb-4 rounded-lg bg-soft-moonstone/30 p-3 text-sm text-deep-ocean">
              <p>
                <span className="font-medium text-deep-tide-blue">
                  {occupancy.freeSeats}
                </span>{" "}
                {occupancy.freeSeats === 1 ? "seat" : "seats"} free ·{" "}
                <span className="font-medium text-deep-tide-blue">
                  {occupancy.offersOutstanding}
                </span>{" "}
                offered ·{" "}
                <span className="font-medium text-deep-tide-blue">
                  {occupancy.seatsWithNobodyOnThem}
                </span>{" "}
                with nobody on{" "}
                {occupancy.seatsWithNobodyOnThem === 1 ? "it" : "them"}
              </p>
              {!occupancy.canOffer && (
                <p className="mt-1 text-xs text-deep-ocean/60">
                  Every free seat already has an offer against it.
                </p>
              )}
            </div>
          )}

          {loading ? (
            <p className="text-center text-soft-moonstone py-8">Loading...</p>
          ) : error ? (
            <p className="text-center text-red-600 py-8">{error}</p>
          ) : entries.length === 0 ? (
            <p className="text-center text-soft-moonstone py-8">
              Nobody on the waiting list yet.
            </p>
          ) : (
            <ul className="divide-y divide-soft-moonstone/20">
              {entries.map((entry) => (
                <li key={entry.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-deep-tide-blue truncate">
                        {entry.customerName}
                        {entry.id === longestWaitingId && (
                          <span className="ml-2 rounded-full bg-ocean-light-blue/20 px-2 py-0.5 text-xs font-medium text-ocean-light-blue">
                            longest waiting
                          </span>
                        )}
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
                    {!entry.offer && (
                      <button
                        type="button"
                        onClick={() => handleRemove(entry.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {entry.offer ? (
                    <div className="mt-2 rounded-md bg-bright-orange/10 px-3 py-2">
                      <p className="text-xs text-deep-ocean">
                        {entry.offer.expired ? "Offer expired" : "Seat held"}
                        {entry.offer.expiresAt &&
                          ` · ${entry.offer.expired ? "was held until" : "until"} ${formatDeadline(entry.offer.expiresAt)}`}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleWithdraw(entry.id)}
                        disabled={busy}
                        className="mt-1 text-sm font-medium text-bright-orange hover:text-deep-tide-blue disabled:opacity-50"
                      >
                        Withdraw offer
                      </button>
                    </div>
                  ) : offeringId === entry.id ? (
                    <div className="mt-2 rounded-md bg-soft-moonstone/30 px-3 py-2">
                      <label
                        htmlFor={`hold-${entry.id}`}
                        className="block text-xs text-deep-ocean/70"
                      >
                        Hold the seat for
                      </label>
                      <select
                        id={`hold-${entry.id}`}
                        value={hold}
                        onChange={(e) =>
                          setHold(e.target.value as HoldDuration)
                        }
                        className="mt-1 h-8 w-full rounded-lg border border-input bg-white px-2 text-sm"
                      >
                        {HOLD_LABELS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-deep-ocean/60">
                        Whichever comes first — the hold never outlasts the
                        class. They get an email with their link.
                      </p>
                      <div className="mt-2 flex gap-3">
                        <button
                          type="button"
                          onClick={() => handleOffer(entry.id)}
                          disabled={busy}
                          className="text-sm font-medium text-bright-orange hover:text-deep-tide-blue disabled:opacity-50"
                        >
                          {busy ? "Offering..." : "Send offer"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOfferingId(null)}
                          className="text-sm text-deep-ocean/60 hover:text-deep-tide-blue"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    occupancy?.canOffer && (
                      <button
                        type="button"
                        onClick={() => {
                          setHold("24h");
                          setOfferingId(entry.id);
                        }}
                        className="mt-2 text-sm font-medium text-ocean-light-blue hover:text-deep-tide-blue"
                      >
                        Offer the seat
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
